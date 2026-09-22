const mongoose = require('mongoose');

const subscriptionPaymentIntentSchema = new mongoose.Schema({
  captainId: { type: mongoose.Schema.Types.ObjectId, ref: 'captain', required: true, index: true },
  planType: { type: String, enum: ['weekly', 'monthly', 'yearly'], required: true },
  vehicleType: { type: String, enum: ['BIKE', 'AUTO', 'CAR'], required: true },
  subscriptionAmount: { type: Number, required: true, min: 0 },
  initialWalletAmount: { type: Number, required: true, min: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ['INR'], default: 'INR' },
  razorpayOrderId: { type: String, trim: true, unique: true, sparse: true },
  razorpayPaymentId: { type: String, trim: true, unique: true, sparse: true },
  razorpaySignature: { type: String, trim: true, maxlength: 500, default: null },
  paymentMethod: { type: String, default: 'RAZORPAY' },
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending', index: true },
  subscriptionStartedAt: { type: Date, default: null },
  subscriptionExpiresAt: { type: Date, default: null },
  activatedAt: { type: Date, default: null },
  failureReason: { type: String, maxlength: 500, default: null },
}, { timestamps: true, collection: 'subscription_payment_intents' });

subscriptionPaymentIntentSchema.index(
  { captainId: 1 },
  {
    unique: true,
    name: 'subscription_payment_pending_captain_unique',
    partialFilterExpression: { status: 'pending' },
  },
);

module.exports = mongoose.model('SubscriptionPaymentIntent', subscriptionPaymentIntentSchema);
