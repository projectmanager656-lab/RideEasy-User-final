const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true, index: true },
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'ride', default: null, index: true },
    amount: { type: Number, required: true, min: 0 },
    direction: { type: String, enum: [ 'credit', 'debit' ], required: true },
    status: { type: String, enum: [ 'pending', 'success', 'failed', 'refunded' ], default: 'success' },
    reference: { type: String, required: true, unique: true, index: true },
    description: { type: String, maxlength: 240, default: '' },
}, { timestamps: true, collection: 'wallet_transactions' });

walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ userId: 1, rideId: 1, direction: 1, description: 1 }, { unique: true, partialFilterExpression: { rideId: { $type: 'objectId' }, direction: 'debit' } });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
