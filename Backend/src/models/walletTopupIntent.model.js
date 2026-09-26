const mongoose = require('mongoose');

const walletTopupIntentSchema = new mongoose.Schema({
  captainId: { type: mongoose.Schema.Types.ObjectId, ref: 'captain', required: true, index: true },
  paymentType: { type: String, enum: ['driver_wallet_topup'], default: 'driver_wallet_topup' },
  walletBalanceSnapshot: { type: Number, required: true, min: 0 },
  minimumWalletBalance: { type: Number, required: true, min: 0 },
  requiredTopUp: { type: Number, required: true, min: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ['INR'], default: 'INR' },
  razorpayOrderId: { type: String, trim: true, unique: true, sparse: true },
  razorpayPaymentId: { type: String, trim: true, unique: true, sparse: true },
  razorpaySignature: { type: String, trim: true, maxlength: 500, default: null },
  paymentMethod: { type: String, default: 'RAZORPAY' },
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending', index: true },
  failureReason: { type: String, maxlength: 500, default: null },
  creditedAt: { type: Date, default: null },
}, { timestamps: true, collection: 'wallet_topup_payment_intents' });

walletTopupIntentSchema.index(
  { captainId: 1 },
  {
    unique: true,
    name: 'wallet_topup_pending_captain_unique',
    partialFilterExpression: { status: 'pending' },
  },
);

module.exports = mongoose.model('WalletTopupIntent', walletTopupIntentSchema);
