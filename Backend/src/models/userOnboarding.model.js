const mongoose = require('mongoose');

const userOnboardingSchema = new mongoose.Schema(
    {
        deviceId: { type: String, required: true, unique: true, index: true },
        onboarded: { type: Boolean, default: false },
    },
    { timestamps: true, collection: 'useronboardings' }
);

module.exports = mongoose.model('userOnboarding', userOnboardingSchema);