const mongoose = require("mongoose");

const razorpayWebhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true, trim: true },
    event: { type: String, required: true, trim: true },
    paymentId: { type: String, default: null, trim: true },
    orderId: { type: String, default: null, trim: true },
    status: {
      type: String,
      enum: ["processing", "processed", "failed"],
      required: true,
    },
    reservationToken: { type: String, required: true },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "razorpay_webhook_events" },
);

module.exports = mongoose.model("RazorpayWebhookEvent", razorpayWebhookEventSchema);
