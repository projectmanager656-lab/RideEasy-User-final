const mongoose = require('mongoose');

/** @deprecated Runtime reads/writes use `service.model` → MongoDB collection `services`. Kept for one-time migration from `pricings`. */
/** Singleton-style config for admin-editable fare multipliers (per vehicle type). */
const pricingSchema = new mongoose.Schema({
    key: { type: String, default: 'global', unique: true },
    rates: {
        BIKE: { baseFare: Number, perKm: Number, platformFee: Number },
        AUTO: { baseFare: Number, perKm: Number, platformFee: Number },
        CAR: { baseFare: Number, perKm: Number, platformFee: Number },
    },
    /** Driver subscription ₹ amounts per vehicle tier (weekly / monthly / yearly). Editable via admin pricing. */
    driverPlans: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

module.exports = mongoose.model('Pricing', pricingSchema);
