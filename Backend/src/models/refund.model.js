const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema({
    refundId: { type: String, required: true, unique: true, index: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentRecord', required: true, index: true },
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'ride', default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true, index: true },
    amount: { type: Number, required: true },
    reason: { type: String, default: '' },
    status: {
        type: String,
        enum: ['REQUESTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'],
        default: 'REQUESTED',
        index: true,
    },
    providerRefundId: { type: String, default: null },
    processedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
}, { timestamps: true, collection: 'refunds' });

refundSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Refund', refundSchema);
