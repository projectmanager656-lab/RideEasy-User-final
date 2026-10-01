const Refund = require('../models/refund.model');
const PaymentRecord = require('../models/paymentRecord.model');
const rideModel = require('../models/rideCore.model');
const userModel = require('../models/user.model');
const WalletTransaction = require('../models/walletTransaction.model');
const crypto = require('crypto');

function generateRefundId() {
    return `REF-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

async function requestRefund({ rideId, userId, reason }) {
    const ride = await rideModel.findOne({ _id: rideId, user: userId });
    if (!ride) {
        const error = new Error('Ride not found');
        error.statusCode = 404;
        throw error;
    }

    const payment = await PaymentRecord.findOne({
        rideId,
        userId,
        paymentStatus: 'success',
    }).sort({ createdAt: -1 });

    if (!payment) {
        const error = new Error('No successful payment found for this ride');
        error.statusCode = 400;
        throw error;
    }

    const existingRefund = await Refund.findOne({
        paymentId: payment._id,
        status: { $in: ['REQUESTED', 'PROCESSING', 'COMPLETED'] },
    });
    if (existingRefund) {
        const error = new Error(`Refund already ${existingRefund.status.toLowerCase()}`);
        error.statusCode = 409;
        throw error;
    }

    const refund = await Refund.create({
        refundId: generateRefundId(),
        paymentId: payment._id,
        rideId: ride._id,
        userId,
        amount: payment.amount,
        reason: reason || 'Customer requested refund',
        status: 'REQUESTED',
    });

    return refund;
}

async function processRefund({ refundId, adminId, resolution = 'COMPLETED', failureReason = null }) {
    const refund = await Refund.findOne({ refundId });
    if (!refund) {
        const error = new Error('Refund record not found');
        error.statusCode = 404;
        throw error;
    }

    if (refund.status === 'COMPLETED') {
        return refund;
    }

    if (resolution === 'COMPLETED') {
        // Credit back to user wallet as standard instant refund
        await userModel.findByIdAndUpdate(refund.userId, {
            $inc: { walletBalance: refund.amount },
        });

        await WalletTransaction.create({
            userId: refund.userId,
            rideId: refund.rideId,
            amount: refund.amount,
            direction: 'credit',
            status: 'success',
            reference: refund.refundId,
            description: `Refund for ride ${String(refund.rideId).slice(-6)}`,
        });

        refund.status = 'COMPLETED';
        refund.processedAt = new Date();
        await refund.save();
    } else {
        refund.status = resolution;
        refund.failureReason = failureReason || 'Refund rejected by admin';
        refund.processedAt = new Date();
        await refund.save();
    }

    return refund;
}

module.exports = {
    requestRefund,
    processRefund,
};
