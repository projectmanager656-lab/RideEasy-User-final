const { validationResult } = require('express-validator');
const onboardingService = require('../services/captainOnboarding.service');
const { ok, fail } = require('../utils/apiResponse');

const API_TO_SERVICE_SECTION = {
    'personal-information': 'personalInformation',
    'identity-verification': 'identityVerification',
    'driving-licence': 'drivingLicence',
    'vehicle-information': 'vehicleInformation',
    insurance: 'insurance',
};

function requestCaptainId(req) {
    if (!req.captain?._id) {
        const err = new Error('Unauthorized');
        err.statusCode = 401;
        throw err;
    }
    return req.captain._id;
}

function validationFailed(req, res) {
    const errors = validationResult(req);
    if (errors.isEmpty()) return false;
    fail(res, req, 400, 'Validation failed', { errors: errors.array() });
    return true;
}

function handleError(res, req, err, fallbackMessage) {
    const status = Number(err?.statusCode || err?.status);
    if (status >= 400 && status < 500) {
        return fail(res, req, status, err.message || fallbackMessage);
    }
    console.error('[captain-onboarding]', err);
    return fail(res, req, 500, fallbackMessage);
}

module.exports.getOnboarding = async (req, res) => {
    try {
        const onboarding = await onboardingService.getOnboarding(requestCaptainId(req));
        if (!onboarding) return fail(res, req, 404, 'Captain onboarding not found');
        return ok(res, req, 200, 'Captain onboarding fetched', { onboarding }, { includeFlatData: false });
    } catch (err) {
        return handleError(res, req, err, 'Unable to fetch captain onboarding');
    }
};

module.exports.getOnboardingSection = async (req, res) => {
    if (validationFailed(req, res)) return;

    try {
        const serviceSection = API_TO_SERVICE_SECTION[req.params.section];
        const section = await onboardingService.getSection(
            requestCaptainId(req),
            serviceSection,
        );
        if (section == null) return fail(res, req, 404, 'Captain onboarding not found');
        return ok(res, req, 200, 'Captain onboarding section fetched', { section }, { includeFlatData: false });
    } catch (err) {
        return handleError(res, req, err, 'Unable to fetch captain onboarding section');
    }
};

module.exports.getOnboardingSectionFields = async (req, res) => {
    if (validationFailed(req, res)) return;

    try {
        const rawFields = req.query?.fields;
        const fields = rawFields === undefined
            ? undefined
            : rawFields.split(',').map((field) => field.trim());
        const serviceSection = API_TO_SERVICE_SECTION[req.params.section];
        const section = await onboardingService.getSection(
            requestCaptainId(req),
            serviceSection,
            fields,
        );
        if (section == null) return fail(res, req, 404, 'Captain onboarding not found');
        return ok(res, req, 200, 'Captain onboarding fields fetched', { section }, { includeFlatData: false });
    } catch (err) {
        return handleError(res, req, err, 'Unable to fetch captain onboarding fields');
    }
};

function updateSection(sectionName, message) {
    return async (req, res) => {
        if (validationFailed(req, res)) return;

        try {
            const onboarding = await onboardingService.updateSection(
                requestCaptainId(req),
                sectionName,
                req.body,
            );
            return ok(res, req, 200, message, { onboarding }, { includeFlatData: false });
        } catch (err) {
            return handleError(res, req, err, 'Unable to update captain onboarding');
        }
    };
}

module.exports.updatePersonalInformation = updateSection(
    'personalInformation',
    'Personal information updated',
);

module.exports.updateIdentityVerification = updateSection(
    'identityVerification',
    'Identity verification updated',
);

module.exports.updateDrivingLicence = updateSection(
    'drivingLicence',
    'Driving licence updated',
);

module.exports.updateVehicleInformation = updateSection(
    'vehicleInformation',
    'Vehicle information updated',
);

module.exports.updateInsurance = updateSection(
    'insurance',
    'Insurance updated',
);

module.exports.submitOnboarding = async (req, res) => {
    if (validationFailed(req, res)) return;

    try {
        const onboarding = await onboardingService.submitOnboarding(requestCaptainId(req));
        return ok(res, req, 200, 'Captain onboarding submitted', { onboarding }, { includeFlatData: false });
    } catch (err) {
        return handleError(res, req, err, 'Unable to submit captain onboarding');
    }
};
