const mongoose = require('mongoose');

/**
 * Coupon rows for the existing `coupons` collection.
 * The collection is written by more than one producer, so the schema carries the
 * live field names (isActive / validFrom / validUntil / minFare) plus the older
 * aliases (active / expiresAt / minimumFare) that existing callers still write.
 * Reads go through `coupon.service` which normalizes both spellings.
 */
const couponSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    title: { type: String, default: function() { return this.code || 'Coupon'; }, maxlength: 120 },
    description: { type: String, default: '', maxlength: 300 },
    // 'flat' and 'fixed' both mean an absolute rupee amount; 'percentage' is a percent.
    discountType: { type: String, enum: [ 'flat', 'fixed', 'percentage' ], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    maxDiscount: { type: Number, default: null, min: 0 },
    minFare: { type: Number, default: 0, min: 0 },
    minimumFare: { type: Number, default: 0, min: 0 },
    validFrom: { type: Date, default: null },
    validUntil: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    eligibility: { type: String, default: 'All eligible users', maxlength: 240 },
    usageLimit: { type: Number, default: null, min: 0 },
    usedCount: { type: Number, default: 0, min: 0 },
    isNewUserOnly: { type: Boolean, default: false },
    creditExcessToWallet: { type: Boolean, default: true },
}, { timestamps: true, collection: 'coupons' });

couponSchema.index({ isActive: 1, validUntil: 1 });

module.exports = mongoose.model('Coupon', couponSchema);
