const crypto = require('crypto');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const Captain = require('../models/captain.model');
const CaptainOnboarding = require('../models/captainOnboarding.model');
const PaymentRecord = require('../models/paymentRecord.model');
const WalletTopupIntent = require('../models/walletTopupIntent.model');
const pricingService = require('./pricing.service');
const { isSubscriptionValid } = require('./subscriptionDriver.service');
const { getMissingOnboardingFields } = require('./captainOnboarding.service');
const { hasPaidRegistrationFee } = require('./registrationPayment.service');

function walletError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getRazorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw walletError('Razorpay credentials are not configured', 500);
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

function verifySignature(orderId, paymentId, signature) {
  if (!signature) throw walletError('razorpay_signature is required', 400);
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  if (expected !== signature) throw walletError('Invalid Razorpay signature', 400);
}

function assertPaymentDetails(intent, paymentInfo, orderId, paymentId) {
  if (!paymentInfo || paymentInfo.id !== paymentId) {
    throw walletError('Razorpay payment could not be verified', 400);
  }
  if (intent.razorpayOrderId !== orderId || paymentInfo.order_id !== orderId) {
    throw walletError('Razorpay payment does not belong to this wallet top-up order', 400);
  }
  if (Number(paymentInfo.amount) !== Math.round(Number(intent.requiredTopUp) * 100)) {
    throw walletError('Razorpay payment amount does not match the wallet top-up', 400);
  }
  if (String(paymentInfo.currency || '').toUpperCase() !== 'INR') {
    throw walletError('Razorpay payment currency must be INR', 400);
  }
  if (!(paymentInfo.captured === true || paymentInfo.status === 'captured' || paymentInfo.status === 'paid')) {
    throw walletError('Razorpay payment is not captured yet', 400);
  }
}

async function assertEligibility(captainId) {
  const captain = await Captain.findById(captainId).lean();
  if (!captain) throw walletError('Driver not found', 404);
  if (captain.blocked) throw walletError('Account blocked', 403);
  if (!captain.approved) throw walletError('Admin approval is required', 403);
  if (captain.status !== 'active') throw walletError('Active captain status is required', 403);
  if (!isSubscriptionValid(captain)) throw walletError('Active non-expired subscription is required', 403);

  const onboarding = await CaptainOnboarding.findOne({ captainId }).lean();
  if (!onboarding || onboarding.onboardingStatus !== 'approved') {
    throw walletError('Approved onboarding is required', 403);
  }
  if (getMissingOnboardingFields(onboarding).length) {
    throw walletError('Complete onboarding is required', 400);
  }
  if (!(await hasPaidRegistrationFee(captainId))) {
    throw walletError('Registration fee payment is required', 403);
  }

  return captain;
}

async function createWalletTopup(captainId) {
  const captain = await assertEligibility(captainId);
  const pricing = await pricingService.getCaptainPricing();
  const minimum = Number(pricing?.minimumWalletBalance);
  if (!Number.isFinite(minimum) || minimum < 0) {
    throw walletError('Minimum wallet balance is not configured', 500);
  }

  const currentWallet = Number(captain.walletBalance || 0);
  const requiredTopUp = Math.max(minimum - currentWallet, 0);
  if (requiredTopUp === 0) {
    return {
      noTopUpRequired: true,
      walletBalance: currentWallet,
      minimumWalletBalance: minimum,
      requiredTopUp: 0,
    };
  }

  const pending = await WalletTopupIntent.findOne({ captainId, status: 'pending' }).sort({ createdAt: -1 });
  if (pending) return pending;

  const order = await getRazorpayClient().orders.create({
    amount: Math.round(requiredTopUp * 100),
    currency: 'INR',
    receipt: `wallet_${captainId}_${Date.now()}`,
    notes: {
      captainId: String(captainId),
      walletBalanceSnapshot: String(currentWallet),
      minimumWalletBalance: String(minimum),
      requiredTopUp: String(requiredTopUp),
      paymentType: 'driver_wallet_topup',
    },
  });

  try {
    return await WalletTopupIntent.create({
      captainId,
      paymentType: 'driver_wallet_topup',
      walletBalanceSnapshot: currentWallet,
      minimumWalletBalance: minimum,
      requiredTopUp,
      totalAmount: requiredTopUp,
      currency: 'INR',
      razorpayOrderId: order.id,
      paymentMethod: 'RAZORPAY',
      status: 'pending',
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return WalletTopupIntent.findOne({ captainId, status: 'pending' }).sort({ createdAt: -1 });
  }
}

async function activateWalletTopup(intentId, captainId, paymentData) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const intent = await WalletTopupIntent.findOne({ _id: intentId, captainId }).session(session);
      if (!intent) throw walletError('Wallet top-up payment intent not found', 404);
      if (intent.status === 'success') {
        result = { intent, alreadyProcessed: true };
        return;
      }
      if (intent.status !== 'pending') throw walletError('Wallet top-up payment is not pending', 409);

      const payment = await PaymentRecord.create([{
        driverId: captainId,
        amount: intent.requiredTopUp,
        paymentMode: 'Razorpay',
        paymentStatus: 'success',
        paymentType: 'driver_wallet_topup',
        externalRef: String(intent._id),
        razorpayOrderId: paymentData.orderId,
        razorpayPaymentId: paymentData.paymentId,
        razorpaySignature: paymentData.signature,
        totalAmount: intent.totalAmount,
        currency: 'INR',
        paymentIntentId: intent._id,
        walletBalanceBefore: intent.walletBalanceSnapshot,
        minimumWalletBalance: intent.minimumWalletBalance,
      }], { session });

      const updatedCaptain = await Captain.findOneAndUpdate(
        { _id: captainId },
        { $inc: { walletBalance: intent.requiredTopUp } },
        { new: true, session },
      );
      if (!updatedCaptain) throw walletError('Driver not found', 404);

      const updatedIntent = await WalletTopupIntent.findOneAndUpdate(
        { _id: intentId, captainId, status: 'pending' },
        {
          $set: {
            status: 'success',
            razorpayPaymentId: paymentData.paymentId,
            razorpaySignature: paymentData.signature,
            paymentMethod: 'RAZORPAY',
            creditedAt: new Date(),
          },
        },
        { new: true, session },
      );
      if (!updatedIntent) throw walletError('Wallet top-up was already processed', 409);
      result = { intent: updatedIntent, captain: updatedCaptain, payment: payment[0], alreadyProcessed: false };
    });

    if (result?.alreadyProcessed) {
      const payment = await PaymentRecord.findOne({ paymentIntentId: intentId });
      return { ...result, payment };
    }
    return result;
  } catch (error) {
    if (error?.code === 11000) {
      const completed = await WalletTopupIntent.findOne({ _id: intentId, captainId, status: 'success' });
      if (completed) {
        const payment = await PaymentRecord.findOne({ paymentIntentId: intentId });
        return { intent: completed, payment, alreadyProcessed: true };
      }
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

async function verifyWalletTopup({ intentId, captainId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const intent = await WalletTopupIntent.findOne({ _id: intentId, captainId });
  if (!intent) throw walletError('Wallet top-up payment intent not found', 404);
  verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);

  if (intent.status === 'success') {
    if (intent.razorpayOrderId !== razorpayOrderId || intent.razorpayPaymentId !== razorpayPaymentId) {
      throw walletError('Wallet top-up was completed with different Razorpay details', 409);
    }
    return activateWalletTopup(intentId, captainId, {
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });
  }

  const paymentInfo = await getRazorpayClient().payments.fetch(razorpayPaymentId);
  assertPaymentDetails(intent, paymentInfo, razorpayOrderId, razorpayPaymentId);
  return activateWalletTopup(intentId, captainId, {
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });
}

async function failWalletTopup({ intentId, captainId, reason }) {
  const intent = await WalletTopupIntent.findOne({ _id: intentId, captainId });
  if (!intent) throw walletError('Wallet top-up payment intent not found', 404);
  if (intent.status === 'success') return intent;
  intent.status = 'failed';
  intent.failureReason = reason || 'Wallet top-up failed';
  return intent.save();
}

async function handleRazorpayWebhook(event, payload) {
  const entity = payload?.payload?.payment?.entity;
  const notes = entity?.notes || {};
  if (notes.paymentType !== 'driver_wallet_topup' || !entity?.order_id) {
    return { handled: false, message: `Event ignored: ${event}` };
  }
  const intent = await WalletTopupIntent.findOne({ razorpayOrderId: entity.order_id });
  if (!intent) return { handled: false, message: 'Wallet top-up payment intent not found' };

  if (event === 'payment.failed') {
    if (intent.status !== 'success') {
      intent.status = 'failed';
      intent.failureReason = entity.error_description || 'Wallet top-up failed';
      await intent.save();
    }
    return { handled: true, intent };
  }
  if (event !== 'payment.captured' && event !== 'order.paid') {
    return { handled: false, message: `Event ignored: ${event}` };
  }

  assertPaymentDetails(intent, entity, entity.order_id, entity.id);
  const result = await activateWalletTopup(intent._id, intent.captainId, {
    orderId: entity.order_id,
    paymentId: entity.id,
    signature: null,
  });
  return { handled: true, ...result };
}

module.exports = {
  createWalletTopup,
  verifyWalletTopup,
  failWalletTopup,
  handleRazorpayWebhook,
};
