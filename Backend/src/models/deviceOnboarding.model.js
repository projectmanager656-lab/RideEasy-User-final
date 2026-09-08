const mongoose = require('mongoose');

/**
 * Per-device onboarding state. One row per browser/device (keyed by the
 * device id the app generates and stores locally), so the Welcome page is
 * shown once per device instead of every launch.
 */
const deviceOnboardingSchema = new mongoose.Schema(
    {
        deviceId: { type: String, required: true, unique: true, index: true },
        onboarded: { type: Boolean, default: false },
    },
    { timestamps: true }
);

module.exports = mongoose.model('DeviceOnboarding', deviceOnboardingSchema);
