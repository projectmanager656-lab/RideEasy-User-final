const crypto = require("crypto");
const { handleRazorpayWebhook } = require("../services/registrationPayment.service");
const WebhookEvent = require("../models/webhookEvent.model");
const PaymentRecord = require("../models/paymentRecord.model");
const rideModel = require("../models/rideCore.model");
const captainModel = require("../models/captain.model");
const SubscriptionRecord = require("../models/subscriptionRecord.model");
const Refund = require("../models/refund.model");
const { expiresAfterPlan } = require("../services/subscriptionDriver.service");

/** Body must be raw Buffer (mounted with express.raw before express.json) */
module.exports.razorpayWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.warn("RAZORPAY_WEBHOOK_SECRET not set");
      return res.status(501).json({ message: "Webhook not configured" });
    }

    const sig = req.headers["x-razorpay-signature"];
    const body = req.body;

    if (!Buffer.isBuffer(body)) {
      return res.status(400).json({ message: "Expected raw body" });
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    if (!sig || sig !== expected) {
      return res.status(400).json({ message: "Invalid signature" });
    }

    let payload;
    try {
      payload = JSON.parse(body.toString("utf8"));
    } catch {
      return res.status(400).json({ message: "Invalid JSON" });
    }

    const eventId = payload?.event_id || payload?.id || `${payload?.event}_${Date.now()}`;

    // Idempotency: prevent processing duplicate webhook deliveries
    const existing = await WebhookEvent.findOne({ eventId });
    if (existing) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    await WebhookEvent.create({
      eventId,
      provider: "razorpay",
      eventType: payload.event || "unknown",
      payload,
    });

    const paymentEntity = payload?.payload?.payment?.entity;
    const notes = paymentEntity?.notes || {};
    const paymentType = notes.paymentType;
    let result = { handled: false };

    // Route event according to payment type
    if (paymentType === "ride_fare" && (payload.event === "payment.captured" || payload.event === "order.paid")) {
      const rideId = notes.rideId;
      const part = notes.part || "full";
      if (rideId) {
        const ride = await rideModel.findById(rideId);
        if (ride) {
          const total = Math.max(0, Number(ride.price || 0) - Number(ride.discountAmount || 0));
          const advance = Math.round(total * 0.25);
          const amount = part === "advance" ? advance : (part === "remaining" ? Math.max(0, total - advance) : total);

          await PaymentRecord.findOneAndUpdate(
            { rideId, externalRef: paymentEntity.id },
            {
              $set: {
                userId: ride.user,
                driverId: ride.captain || null,
                amount,
                paymentMode: "Online",
                paymentStatus: "success",
                paymentType: "ride_fare",
                paymentPart: part,
              },
            },
            { upsert: true, new: true }
          );

          const set = part === "advance"
            ? { advancePaymentStatus: "success", advanceAmount: amount, remainingAmount: Math.max(0, total - amount) }
            : { paymentStatus: "success", chargedAmount: total, remainingAmount: 0 };
          await rideModel.findByIdAndUpdate(rideId, { $set: set });
          result = { handled: true, rideId };
        }
      }
    } else if (paymentType === "driver_subscription" && (payload.event === "payment.captured" || payload.event === "order.paid")) {
      const captainId = notes.captainId;
      const plan = notes.plan || "weekly";
      const tier = notes.tier || "AUTO";
      if (captainId) {
        const captain = await captainModel.findById(captainId);
        if (captain) {
          const now = new Date();
          const base = captain.subscriptionExpiresAt && new Date(captain.subscriptionExpiresAt) > now
            ? new Date(captain.subscriptionExpiresAt)
            : now;
          const subscriptionExpiresAt = expiresAfterPlan(plan, base);
          const subscriptionStartedAt = captain.subscriptionStartedAt || now;

          await captainModel.findByIdAndUpdate(captainId, {
            subscriptionStatus: "active",
            subscriptionPlan: plan,
            subscriptionStartedAt,
            subscriptionExpiresAt,
          });

          const amt = Math.round(Number(paymentEntity.amount || 0) / 100);
          await SubscriptionRecord.create({
            driverId: captainId,
            vehicleType: tier,
            planType: plan,
            amount: amt,
            startDate: subscriptionStartedAt,
            expiryDate: subscriptionExpiresAt,
            status: "active",
          });

          await PaymentRecord.create({
            driverId: captainId,
            amount: amt,
            paymentMode: "Online",
            paymentStatus: "success",
            paymentType: "driver_subscription",
            externalRef: paymentEntity.id,
          });
          result = { handled: true, captainId, subscription: "activated" };
        }
      }
    } else if (payload.event === "refund.processed" || payload.event === "refund.created") {
      const refundEntity = payload?.payload?.refund?.entity;
      if (refundEntity?.payment_id) {
        await Refund.findOneAndUpdate(
          { providerRefundId: refundEntity.id },
          { $set: { status: "COMPLETED", processedAt: new Date() } }
        );
        result = { handled: true, refundId: refundEntity.id };
      }
    } else {
      // Default: delegation to registration payment handler
      result = await handleRazorpayWebhook(payload.event, payload);
    }

    console.log("[Razorpay webhook]", payload.event, result.message || "handled");
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    console.error("[Razorpay webhook]", error);
    return res.status(error.statusCode || 500).json({
      received: false,
      message: error.message || "Webhook processing failed",
    });
  }
};