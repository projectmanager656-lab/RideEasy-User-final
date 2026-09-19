const mongoose = require('mongoose');
const userModel = require('../models/user.model');
const rideModel = require('../models/rideCore.model');
const captainModel = require('../models/captain.model');
const PaymentRecord = require('../models/paymentRecord.model');
const WalletTransaction = require('../models/walletTransaction.model');
const CouponUsage = require('../models/couponUsage.model');
const pricingService = require('./pricing.service');
const { validateCoupon } = require('./coupon.service');

function walletError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

async function payRideFromWallet({ rideId, userId, part }) {
    if (!mongoose.isValidObjectId(rideId)) throw walletError('Invalid ride id');
    const paymentPart = String(part || '').toLowerCase() === 'remaining' ? 'remaining' : 'advance';
    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            const ride = await rideModel.findOne({ _id: rideId, user: userId }).session(session);
            if (!ride) throw walletError('Ride not found', 404);
            if (!ride.captain) throw walletError('Driver is not assigned yet', 409);
            if (ride.status !== 'accepted' && ride.status !== 'arrived' && ride.status !== 'started' && ride.status !== 'completed') {
                throw walletError('Ride is not ready for payment', 409);
            }
            const total = Math.max(0, Number(ride.price || 0) - Number(ride.discountAmount || 0));
            const advance = Math.round(total * 0.25);
            const amount = paymentPart === 'remaining' ? Math.max(0, total - advance) : advance;
            if (amount <= 0) throw walletError('Invalid payment amount');
            const existing = await WalletTransaction.findOne({ userId, rideId, direction: 'debit', description: { $regex: paymentPart } }).session(session);
            if (existing?.status === 'success') {
                result = { ride, transaction: existing, alreadyPaid: true };
                return;
            }
            const updatedUser = await userModel.findOneAndUpdate(
                { _id: userId, walletBalance: { $gte: amount } },
                { $inc: { walletBalance: -amount } },
                { new: true, session },
            );
            if (!updatedUser) throw walletError('Insufficient wallet balance', 402);
            const reference = `wallet_${rideId}_${paymentPart}_${new mongoose.Types.ObjectId().toString()}`;
            const transaction = await WalletTransaction.create([{
                userId, rideId, amount, direction: 'debit', status: 'success', reference,
                description: `Ride ${paymentPart} payment`,
            }], { session }).then((rows) => rows[0]);
            await PaymentRecord.create([{
                rideId, userId, driverId: ride.captain, amount, paymentMode: 'Wallet', paymentStatus: 'success', paymentType: `ride_fare_${paymentPart}`, paymentPart, externalRef: reference,
            }], { session });
            const commissionPct = Number(await pricingService.getCommissionPercent());
            const platformFee = Math.round(amount * commissionPct / 100);
            const earning = Math.max(0, amount - platformFee);
            await captainModel.findOneAndUpdate({ _id: ride.captain }, [ { $set: {
                walletBalance: { $max: [ { $subtract: [ { $ifNull: ['$walletBalance', 0] }, platformFee ] }, 0 ] },
                totalEarnings: { $add: [ { $ifNull: ['$totalEarnings', 0] }, earning ] },
            } } ], { new: true, session });
            const set = paymentPart === 'advance'
                ? { advancePaymentStatus: 'success', advanceAmount: amount, remainingAmount: Math.max(0, total - amount) }
                : {
                    paymentStatus: 'success',
                    chargedAmount: total,
                    remainingAmount: 0,
                    platformFee: Math.round(total * commissionPct / 100),
                    captainNetEarning: Math.max(0, total - Math.round(total * commissionPct / 100)),
                };
            await rideModel.updateOne({ _id: rideId }, { $set: set }, { session });
            result = { ride: { ...ride.toObject(), ...set, chargedAmount: paymentPart === 'remaining' ? total : ride.chargedAmount }, transaction, alreadyPaid: false };
        });
        return result;
    } finally {
        await session.endSession();
    }
}

async function applyCouponToRide({ rideId, userId, code, session = null }) {
    const ride = await rideModel.findOne({ _id: rideId, user: userId }).session(session);
    if (!ride) throw walletError('Ride not found', 404);
    const result = await validateCoupon({ code, userId, fare: ride.price, session });
    if (!result.coupon) return result;
    await rideModel.updateOne({ _id: rideId }, { $set: { discountAmount: result.discountAmount, discountReason: result.coupon.code, couponCode: result.coupon.code, chargedAmount: result.finalFare } }, { session });
    await CouponUsage.create([{ couponId: result.coupon._id, userId, rideId, discountAmount: result.discountAmount }], { session });
    return result;
}

module.exports = { payRideFromWallet, applyCouponToRide };
