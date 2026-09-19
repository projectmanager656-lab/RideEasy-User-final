const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 300 },
    discountType: { type: String, enum: [ 'percentage', 'fixed' ], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    maxDiscount: { type: Number, default: null, min: 0 },
    minimumFare: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    eligibility: { type: String, default: 'All eligible users', maxlength: 240 },
}, { timestamps: true, collection: 'coupons' });

couponSchema.index({ active: 1, expiresAt: 1 });
module.exports = mongoose.model('Coupon', couponSchema);
