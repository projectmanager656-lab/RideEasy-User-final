const deviceOnboardingModel = require('../models/deviceOnboarding.model');
const { ok, fail } = require('../utils/apiResponse');

const sanitizeDeviceId = (value) => String(value || '').trim().slice(0, 128);

/** GET /users/onboarding/status?deviceId=… → { onboarded } */
module.exports.getOnboardingStatus = async (req, res, next) => {
    try {
        const deviceId = sanitizeDeviceId(req.query.deviceId || req.body?.deviceId);
        if (!deviceId) return fail(res, req, 400, 'deviceId is required');

        const record = await deviceOnboardingModel.findOne({ deviceId }).lean();
        return ok(res, req, 200, 'Onboarding status fetched', {
            onboarded: Boolean(record?.onboarded),
        });
    } catch (err) {
        return next(err);
    }
};

/** POST /users/onboarding/complete { deviceId } → { onboarded: true } */
module.exports.markOnboardingComplete = async (req, res, next) => {
    try {
        const deviceId = sanitizeDeviceId(req.body?.deviceId);
        if (!deviceId) return fail(res, req, 400, 'deviceId is required');

        await deviceOnboardingModel.updateOne(
            { deviceId },
            { $set: { onboarded: true } },
            { upsert: true }
        );
        return ok(res, req, 200, 'Onboarding marked complete', { onboarded: true });
    } catch (err) {
        return next(err);
    }
};
