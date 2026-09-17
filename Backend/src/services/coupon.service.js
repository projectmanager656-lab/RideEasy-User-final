const Coupon = require('../models/coupon.model');
const CouponUsage = require('../models/couponUsage.model');

function couponError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

async function listAvailableCoupons(userId) {
    const now = new Date();
    const coupons = await Coupon.find({ active: true, $or: [ { expiresAt: null }, { expiresAt: { $gt: now } } ] }).sort({ expiresAt: 1, createdAt: -1 }).lean();
    const used = await CouponUsage.find({ userId, couponId: { $in: coupons.map((c) => c._id) } }).select('couponId').lean();
    const usedIds = new Set(used.map((u) => String(u.couponId)));
    return coupons.map((coupon) => ({
        ...coupon,
        used: usedIds.has(String(coupon._id)),
        expired: Boolean(coupon.expiresAt && new Date(coupon.expiresAt) <= now),
    }));
}

async function validateCoupon({ code, userId, fare, session = null }) {
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized) return { coupon: null, discountAmount: 0 };
    const coupon = await Coupon.findOne({ code: normalized, active: true }).session(session).lean();
    if (!coupon) throw couponError('Coupon is not available', 404);
    if (coupon.expiresAt && new Date(coupon.expiresAt) <= new Date()) throw couponError('Coupon has expired', 400);
    const baseFare = Number(fare);
    if (!Number.isFinite(baseFare) || baseFare <= 0) throw couponError('Fare is invalid', 400);
    if (baseFare < Number(coupon.minimumFare || 0)) throw couponError(`Minimum fare for this coupon is ₹${coupon.minimumFare}`, 400);
    const alreadyUsed = await CouponUsage.exists({ couponId: coupon._id, userId }).session(session);
    if (alreadyUsed) throw couponError('Coupon has already been used', 409);
    let discountAmount = coupon.discountType === 'percentage'
        ? baseFare * Number(coupon.discountValue || 0) / 100
        : Number(coupon.discountValue || 0);
    if (coupon.maxDiscount != null) discountAmount = Math.min(discountAmount, Number(coupon.maxDiscount));
    discountAmount = Math.min(baseFare, Math.max(0, Math.round(discountAmount * 100) / 100));
    return { coupon, discountAmount, finalFare: Math.max(0, baseFare - discountAmount) };
}

module.exports = { listAvailableCoupons, validateCoupon };
