const mongoose = require('mongoose');

const couponUsageSchema = new mongoose.Schema({
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true, index: true },
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'ride', required: true, unique: true },
    discountAmount: { type: Number, required: true, min: 0 },
}, { timestamps: true, collection: 'coupon_usages' });

couponUsageSchema.index({ couponId: 1, userId: 1 }, { unique: true });
module.exports = mongoose.model('CouponUsage', couponUsageSchema);
