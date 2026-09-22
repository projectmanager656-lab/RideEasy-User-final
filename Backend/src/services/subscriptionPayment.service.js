const crypto = require('crypto');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const Captain = require('../models/captain.model');
const CaptainOnboarding = require('../models/captainOnboarding.model');
const SubscriptionRecord = require('../models/subscriptionRecord.model');
const PaymentRecord = require('../models/paymentRecord.model');
const SubscriptionPaymentIntent = require('../models/subscriptionPaymentIntent.model');
const pricingService = require('./pricing.service');
const { expiresAfterPlan } = require('./subscriptionDriver.service');
const { getMissingOnboardingFields } = require('./captainOnboarding.service');
const { hasPaidRegistrationFee } = require('./registrationPayment.service');

const PLANS = ['weekly', 'monthly', 'yearly'];

function subscriptionError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getRazorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw subscriptionError('Razorpay credentials are not configured', 500);
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

function normalizeVehicleTier(value) {
  const tier = String(value || '').trim().toUpperCase();
  if (tier === 'MINI' || tier === 'SEDAN') return 'CAR';
  return tier;
}

function validateWalletAmount(value) {
  const amount = value === undefined ? 0 : value;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    throw subscriptionError('initialWalletAmount must be a finite non-negative number', 400);
  }
  return amount;
}

function verifySignature(orderId, paymentId, signature) {
  if (!signature) throw subscriptionError('razorpay_signature is required', 400);
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  if (expected !== signature) throw subscriptionError('Invalid Razorpay signature', 400);
}

function assertPaymentDetails(intent, paymentInfo, orderId, paymentId) {
  if (!paymentInfo || paymentInfo.id !== paymentId) {
    throw subscriptionError('Razorpay payment could not be verified', 400);
  }
  if (intent.razorpayOrderId !== orderId || paymentInfo.order_id !== orderId) {
    throw subscriptionError('Razorpay payment does not belong to this subscription order', 400);
  }
  if (Number(paymentInfo.amount) !== Math.round(Number(intent.totalAmount) * 100)) {
    throw subscriptionError('Razorpay payment amount does not match the subscription payment', 400);
  }
  if (String(paymentInfo.currency || '').toUpperCase() !== 'INR') {
    throw subscriptionError('Razorpay payment currency must be INR', 400);
  }
  if (!(paymentInfo.captured === true || paymentInfo.status === 'captured' || paymentInfo.status === 'paid')) {
    throw subscriptionError('Razorpay payment is not captured yet', 400);
  }
}

async function assertEligibility(captainId) {
  const captain = await Captain.findById(captainId).lean();
  if (!captain) throw subscriptionError('Driver not found', 404);
  if (captain.blocked) throw subscriptionError('Account blocked', 403);
  if (!captain.approved) throw subscriptionError('Admin approval is required', 403);

  const onboarding = await CaptainOnboarding.findOne({ captainId }).lean();
  if (!onboarding || !['submitted', 'approved'].includes(onboarding.onboardingStatus)) {
    throw subscriptionError('Submitted onboarding is required', 403);
  }
  if (getMissingOnboardingFields(onboarding).length) {
    throw subscriptionError('Complete onboarding is required', 400);
  }
  if (!(await hasPaidRegistrationFee(captainId))) {
    throw subscriptionError('Registration fee payment is required', 403);
  }

  return { captain, onboarding };
}

async function createSubscriptionPayment({ captainId, plan, initialWalletAmount }) {
  if (!PLANS.includes(plan)) throw subscriptionError('Invalid subscription plan', 400);
  const { captain, onboarding } = await assertEligibility(captainId);
  const walletAmount = validateWalletAmount(initialWalletAmount);
  const tier = normalizeVehicleTier(onboarding.vehicleInformation?.vehicleType);
  const plans = await pricingService.getDriverPlansMerged();
  const subscriptionAmount = Number(plans?.[tier]?.[plan]);
  if (!Number.isFinite(subscriptionAmount) || subscriptionAmount <= 0) {
    throw subscriptionError(`Invalid ${plan} subscription amount for ${tier}`, 400);
  }
  const totalAmount = subscriptionAmount + walletAmount;

  const pending = await SubscriptionPaymentIntent.findOne({ captainId, status: 'pending' }).sort({ createdAt: -1 });
  if (pending) return pending;

  const order = await getRazorpayClient().orders.create({
    amount: Math.round(totalAmount * 100),
    currency: 'INR',
    receipt: `sub_${captainId}_${Date.now()}`,
    notes: {
      captainId: String(captainId),
      plan,
      vehicleType: tier,
      subscriptionAmount: String(subscriptionAmount),
      initialWalletAmount: String(walletAmount),
      paymentType: 'driver_subscription_wallet',
    },
  });

  try {
    return await SubscriptionPaymentIntent.create({
      captainId,
      planType: plan,
      vehicleType: tier,
      subscriptionAmount,
      initialWalletAmount: walletAmount,
      totalAmount,
      currency: 'INR',
      razorpayOrderId: order.id,
      status: 'pending',
      paymentMethod: 'RAZORPAY',
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return SubscriptionPaymentIntent.findOne({ captainId, status: 'pending' }).sort({ createdAt: -1 });
  }
}

async function activateIntent(intentId, captainId, paymentData) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const intent = await SubscriptionPaymentIntent.findOne({ _id: intentId, captainId }).session(session);
      if (!intent) throw subscriptionError('Subscription payment intent not found', 404);
      if (intent.status === 'success') {
        result = { intent, alreadyProcessed: true };
        return;
      }
      if (intent.status !== 'pending') throw subscriptionError('Subscription payment is not pending', 409);

      const captain = await Captain.findById(captainId).session(session);
      if (!captain) throw subscriptionError('Driver not found', 404);
      const now = new Date();
      const base = captain.subscriptionExpiresAt && new Date(captain.subscriptionExpiresAt) > now
        ? new Date(captain.subscriptionExpiresAt)
        : now;
      const startedAt = captain.subscriptionStartedAt || now;
      const expiresAt = expiresAfterPlan(intent.planType, base);

      const payment = await PaymentRecord.create([{
        driverId: captainId,
        amount: intent.totalAmount,
        paymentMode: 'Razorpay',
        paymentStatus: 'success',
        paymentType: 'driver_subscription_wallet',
        externalRef: String(intent._id),
        razorpayOrderId: paymentData.orderId,
        razorpayPaymentId: paymentData.paymentId,
        razorpaySignature: paymentData.signature,
        subscriptionAmount: intent.subscriptionAmount,
        initialWalletAmount: intent.initialWalletAmount,
        totalAmount: intent.totalAmount,
        currency: 'INR',
        planType: intent.planType,
        paymentIntentId: intent._id,
      }], { session });

      await SubscriptionRecord.create([{
        driverId: captainId,
        vehicleType: intent.vehicleType,
        planType: intent.planType,
        amount: intent.subscriptionAmount,
        startDate: startedAt,
        expiryDate: expiresAt,
        status: 'active',
        paymentIntentId: intent._id,
        paymentRecordId: payment[0]._id,
      }], { session });

      const updatedCaptain = await Captain.findOneAndUpdate(
        { _id: captainId },
        {
          $set: {
            subscriptionStatus: 'active',
            subscriptionPlan: intent.planType,
            subscriptionStartedAt: startedAt,
            subscriptionExpiresAt: expiresAt,
          },
          $inc: { walletBalance: intent.initialWalletAmount },
        },
        { new: true, session },
      );
      if (!updatedCaptain) throw subscriptionError('Driver not found', 404);

      const updatedIntent = await SubscriptionPaymentIntent.findOneAndUpdate(
        { _id: intentId, captainId, status: 'pending' },
        {
          $set: {
            status: 'success',
            razorpayPaymentId: paymentData.paymentId,
            razorpaySignature: paymentData.signature,
            paymentMethod: 'RAZORPAY',
            subscriptionStartedAt: startedAt,
            subscriptionExpiresAt: expiresAt,
            activatedAt: new Date(),
          },
        },
        { new: true, session },
      );
      if (!updatedIntent) throw subscriptionError('Subscription payment was already processed', 409);
      result = { intent: updatedIntent, captain: updatedCaptain, payment: payment[0], alreadyProcessed: false };
    });
    if (result?.alreadyProcessed) {
      const payment = await PaymentRecord.findOne({ paymentIntentId: intentId });
      return { ...result, payment };
    }
    return result;
  } catch (error) {
    if (error?.code === 11000) {
      const completed = await SubscriptionPaymentIntent.findOne({
        _id: intentId,
        captainId,
        status: 'success',
      });
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

async function verifySubscriptionPayment({ intentId, captainId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const intent = await SubscriptionPaymentIntent.findOne({ _id: intentId, captainId });
  if (!intent) throw subscriptionError('Subscription payment intent not found', 404);
  verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);

  if (intent.status === 'success') {
    if (intent.razorpayOrderId !== razorpayOrderId || intent.razorpayPaymentId !== razorpayPaymentId) {
      throw subscriptionError('Subscription payment was completed with different Razorpay details', 409);
    }
    return activateIntent(intentId, captainId, {
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });
  }

  const paymentInfo = await getRazorpayClient().payments.fetch(razorpayPaymentId);
  assertPaymentDetails(intent, paymentInfo, razorpayOrderId, razorpayPaymentId);
  return activateIntent(intentId, captainId, {
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });
}

async function failSubscriptionPayment({ intentId, captainId, reason }) {
  const intent = await SubscriptionPaymentIntent.findOne({ _id: intentId, captainId });
  if (!intent) throw subscriptionError('Subscription payment intent not found', 404);
  if (intent.status === 'success') return intent;
  intent.status = 'failed';
  intent.failureReason = reason || 'Subscription payment failed';
  return intent.save();
}

async function handleRazorpayWebhook(event, payload) {
  const entity = payload?.payload?.payment?.entity;
  const notes = entity?.notes || {};
  if (notes.paymentType !== 'driver_subscription_wallet' || !entity?.order_id) {
    return { handled: false, message: `Event ignored: ${event}` };
  }
  const intent = await SubscriptionPaymentIntent.findOne({ razorpayOrderId: entity.order_id });
  if (!intent) return { handled: false, message: 'Subscription payment intent not found' };
  if (event === 'payment.failed') {
    if (intent.status !== 'success') {
      intent.status = 'failed';
      intent.failureReason = entity.error_description || 'Subscription payment failed';
      await intent.save();
    }
    return { handled: true, intent };
  }
  if (event !== 'payment.captured' && event !== 'order.paid') {
    return { handled: false, message: `Event ignored: ${event}` };
  }
  assertPaymentDetails(intent, entity, entity.order_id, entity.id);
  const result = await activateIntent(intent._id, intent.captainId, {
    orderId: entity.order_id,
    paymentId: entity.id,
    signature: null,
  });
  return { handled: true, ...result };
}

module.exports = {
  createSubscriptionPayment,
  verifySubscriptionPayment,
  failSubscriptionPayment,
  handleRazorpayWebhook,
  validateWalletAmount,
};
