const mongoose = require('mongoose');

const serviceAreaSchema = new mongoose.Schema({
    key: { type: String, required: true },
    name: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    radius: { type: Number, required: true },
}, { _id: false });

/**
 * Single global RideEasy service config (fares, driver plans, coverage, commission, trial).
 * Collection name: `services` (explicit).
 */
const serviceSchema = new mongoose.Schema({
    key: { type: String, default: 'global', unique: true },
    rates: {
        BIKE: { baseFare: Number, perKm: Number, platformFee: Number },
        AUTO: { baseFare: Number, perKm: Number, platformFee: Number },
        CAR: { baseFare: Number, perKm: Number, platformFee: Number },
    },
    driverPlans: { type: mongoose.Schema.Types.Mixed },
    /** Service cities / circles (same shape as `config/serviceAreas.js`). */
    serviceAreas: { type: [ serviceAreaSchema ], default: [] },
    /** Platform commission % on completed paid rides (0–100). */
    commissionPercent: { type: Number, min: 0, max: 100, default: 15 },
    /** New driver free-trial length in days (0 = use paid plan at signup). */
    launchTrialDays: { type: Number, min: 0, max: 365, default: 0 },
}, { timestamps: true, collection: 'services' });

module.exports = mongoose.model('Service', serviceSchema);
