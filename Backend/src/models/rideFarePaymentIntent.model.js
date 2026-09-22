const mongoose = require("mongoose");

// Some focused service tests replace mongoose with only transaction helpers.
// They do not exercise this model, so avoid evaluating schema metadata there.
if (!mongoose.Schema) {
  module.exports = {};
} else {
const rideFarePaymentIntentSchema = new mongoose.Schema({
  rideId: { type: mongoose.Schema.Types.ObjectId, ref: "ride", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
  captainId: { type: mongoose.Schema.Types.ObjectId, ref: "captain", default: null },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ["INR"], default: "INR" },
  paymentType: { type: String, enum: ["ride_fare"], default: "ride_fare" },
  razorpayOrderId: { type: String, trim: true, unique: true, sparse: true },
  razorpayPaymentId: { type: String, trim: true, unique: true, sparse: true },
  razorpaySignature: { type: String, trim: true, maxlength: 500, default: null },
  status: { type: String, enum: ["creating", "pending", "success", "failed"], default: "creating", index: true },
  failureReason: { type: String, maxlength: 500, default: null },
  paidAt: { type: Date, default: null },
}, { timestamps: true, collection: "ride_fare_payment_intents" });

rideFarePaymentIntentSchema.index({ rideId: 1 }, { unique: true, name: "ride_fare_payment_active_ride_unique", partialFilterExpression: { status: { $in: ["creating", "pending"] } } });
module.exports = mongoose.model("RideFarePaymentIntent", rideFarePaymentIntentSchema);
}
