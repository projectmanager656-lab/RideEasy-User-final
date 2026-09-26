/**
 * Ride payment settlement after passenger pays (cash / UPI / wallet mock).
 * Platform commission from {@link ./pricing.service} — keeps ledger consistent.
 */
const rideModel = require('../models/rideCore.model');
const captainModel = require('../models/captain.model');
const PaymentRecord = require('../models/paymentRecord.model');
const pricingService = require('./pricing.service');
const logger = require('../utils/logger');

function captainRefToId (c) {
    if (c == null) return null;
    try {
        if (typeof c === 'object' && c._id != null) return String(c._id);
        return String(c);
    } catch {
        return null;
    }
}

async function recordRideFareLedger (rideId, payableAmount) {
    try {
        const dup = await PaymentRecord.findOne({ rideId, paymentType: 'ride_fare' });
        if (dup) return dup;
        const populated = await rideModel.findById(rideId).populate('user').populate('captain');
        if (!populated) return null;
        const pm = String(populated.paymentMethod || 'Cash').toUpperCase();
        const mode = [ 'UPI', 'QR', 'Cash', 'WALLET' ].includes(pm) ? pm : 'Cash';
        return await PaymentRecord.create({
            rideId,
            driverId: populated.captain?._id ?? populated.captain,
            userId: populated.user?._id ?? populated.user,
            amount: payableAmount,
            paymentMode: mode,
            paymentStatus: 'success',
            paymentType: 'ride_fare',
        });
    } catch (e) {
        logger.payment('ledger ride_fare skipped', { rideId: String(rideId), err: e?.message });
        return null;
    }
}

async function recordRideAdvanceLedger (rideId, amount, mode) {
    try {
        const dup = await PaymentRecord.findOne({ rideId, paymentType: 'ride_advance' });
        if (dup) return dup;
        const populated = await rideModel.findById(rideId).populate('user').populate('captain');
        if (!populated) return null;
        const paymentMode = [ 'UPI', 'QR', 'Cash', 'WALLET' ].includes(String(mode || '').toUpperCase()) ? String(mode).toUpperCase() : 'UPI';
        return await PaymentRecord.create({
            rideId,
            driverId: populated.captain?._id ?? populated.captain,
            userId: populated.user?._id ?? populated.user,
            amount,
            paymentMode,
            paymentStatus: 'success',
            paymentType: 'ride_advance',
        });
    } catch (e) {
        logger.payment('ledger ride_advance skipped', { rideId: String(rideId), err: e?.message });
        return null;
    }
}

/**
 * When paymentStatus is success, compute platformFee / captainNetEarning and credit captain wallet once (idempotent).
 * @returns {Promise<object|null>} Populated ride or null
 */
async function settleRidePaymentIfNeeded (rideId) {
    const rid = rideId?.toString ? rideId.toString() : String(rideId || '');
    if (!rid) return null;
    const ride = await rideModel.findById(rid).select('paymentStatus captainNetEarning price discountAmount advanceAmount captain');
    if (!ride || ride.paymentStatus !== 'success') return null;
    if (ride.captainNetEarning != null) {
        return rideModel.findById(rid).populate('user', 'name phone email').populate('captain');
    }
    const discountAmount = Number(ride.discountAmount || 0);
    const advanceAmount = Number(ride.advanceAmount || 0);
    const payableAmount = Math.max(0, Number(ride.price || 0) - discountAmount - advanceAmount);
    const commissionPct = await pricingService.getCommissionPercent();
    const pct = commissionPct / 100;
    const platformFee = Math.round(payableAmount * pct);
    const net = Math.max(0, payableAmount - platformFee);

    const updated = await rideModel.findOneAndUpdate(
        { _id: rid, captainNetEarning: null, paymentStatus: 'success' },
        { $set: { platformFee, captainNetEarning: net, chargedAmount: payableAmount } },
        { new: true },
    );
    if (!updated) {
        return rideModel.findById(rid).populate('user', 'name phone email').populate('captain');
    }
    const capId = captainRefToId(updated.captain);
    if (capId) {
        await captainModel.findByIdAndUpdate(capId, {
            $inc: { walletBalance: net, totalEarnings: net },
        });
    }
    logger.payment('settled', { rideId: rid, payableAmount, platformFee, net });
    await recordRideFareLedger(rid, payableAmount);
    return rideModel.findById(rid).populate('user', 'name phone email').populate('captain');
}

module.exports = {
    settleRidePaymentIfNeeded,
    captainRefToId,
    recordRideFareLedger,
    recordRideAdvanceLedger,
};
