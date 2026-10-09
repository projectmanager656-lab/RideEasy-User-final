const Razorpay = require("razorpay");
const RegistrationPayment = require("../models/registrationPayment.model");

const DEFAULT_REGISTRATION_FEE = 499;

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function createRegistrationPayment(
  captainId,
  amount = DEFAULT_REGISTRATION_FEE,
) {
  if (!captainId) {
    const error = new Error("Captain ID is required");
    error.statusCode = 400;
    throw error;
  }

  const existing = await RegistrationPayment.findOne({
    captainId,
    paymentStatus: "success",
  }).sort({ createdAt: -1 });

  if (existing) {
    const error = new Error("Registration fee has already been paid");
    error.statusCode = 409;
    error.payment = existing;
    throw error;
  }

  // Razorpay expects the amount in paise.
  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(Number(amount) * 100),
    currency: "INR",
    receipt: `reg_${captainId}_${Date.now()}`,
    notes: {
      captainId: String(captainId),
      paymentType: "registration_fee",
    },
  });

  return RegistrationPayment.create({
    captainId,
    amount,
    paymentStatus: "pending",
    razorpayOrderId: razorpayOrder.id,
  });
}

async function markRegistrationPaymentSuccess(
  paymentId,
  { paymentMethod, transactionId },
) {
  const payment = await RegistrationPayment.findById(paymentId);

  if (!payment) {
    const error = new Error("Registration payment not found");
    error.statusCode = 404;
    throw error;
  }

  if (payment.paymentStatus === "success") {
    return payment;
  }

  payment.paymentStatus = "success";
  payment.paymentMethod = paymentMethod;
  payment.transactionId = transactionId;
  payment.paidAt = new Date();

  return payment.save();
}

async function markRegistrationPaymentFailed(paymentId, failureReason) {
  const payment = await RegistrationPayment.findById(paymentId);

  if (!payment) {
    const error = new Error("Registration payment not found");
    error.statusCode = 404;
    throw error;
  }

  payment.paymentStatus = "failed";
  payment.failureReason = failureReason || "Registration payment failed";

  return payment.save();
}

async function markRegistrationPaymentSuccessByRazorpayOrder(
  razorpayOrderId,
  { paymentMethod, transactionId },
) {
  if (!razorpayOrderId) {
    const error = new Error("Razorpay order ID is required");
    error.statusCode = 400;
    throw error;
  }

  const payment = await RegistrationPayment.findOne({
    razorpayOrderId,
  });

  if (!payment) {
    const error = new Error(
      "Registration payment for Razorpay order not found",
    );
    error.statusCode = 404;
    throw error;
  }

  // Idempotency: webhook may be delivered more than once.
  if (payment.paymentStatus === "success") {
    return payment;
  }

  payment.paymentStatus = "success";
  payment.paymentMethod = paymentMethod || null;
  payment.transactionId = transactionId || null;
  payment.paidAt = new Date();

  return payment.save();
}

async function getLatestRegistrationPayment(captainId) {
  return RegistrationPayment.findOne({ captainId })
    .sort({ createdAt: -1 })
    .lean();
}

async function hasPaidRegistrationFee(captainId) {
  const payment = await RegistrationPayment.exists({
    captainId,
    paymentStatus: "success",
  });

  return Boolean(payment);
}

async function handleRazorpayWebhook(event, payload) {
  const paymentEntity = payload?.payload?.payment?.entity;

  if (!paymentEntity) {
    return { handled: false, message: "Payment entity not found" };
  }

  const razorpayOrderId = paymentEntity.order_id;
  const razorpayPaymentId = paymentEntity.id;

  if (!razorpayOrderId) {
    return { handled: false, message: "Razorpay order ID not found" };
  }

  const payment = await RegistrationPayment.findOne({
    razorpayOrderId,
  });

  if (!payment) {
    return { handled: false, message: "Registration payment not found" };
  }

  if (event === "payment.captured" || event === "order.paid") {
    if (payment.paymentStatus !== "success") {
      payment.paymentStatus = "success";
      payment.paymentMethod = paymentEntity.method || "razorpay";
      payment.transactionId = razorpayPaymentId;
      payment.paidAt = new Date();

      await payment.save();
    }

    return { handled: true, payment };
  }

  if (event === "payment.failed") {
    payment.paymentStatus = "failed";
    payment.failureReason =
      paymentEntity.error_description || "Razorpay payment failed";

    await payment.save();

    return { handled: true, payment };
  }

  return { handled: false, message: `Event ignored: ${event}` };
}

module.exports = {
  createRegistrationPayment,
  markRegistrationPaymentSuccess,
  markRegistrationPaymentFailed,
  getLatestRegistrationPayment,
  hasPaidRegistrationFee,
  handleRazorpayWebhook,
};
