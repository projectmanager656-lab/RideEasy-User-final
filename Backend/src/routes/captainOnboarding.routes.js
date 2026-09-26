const express = require('express');
const auth = require('../middlewares/auth.middleware');
const captainOnboardingController = require('../controllers/captainOnboarding.controller');
const {
    personalInformationValidators,
    identityVerificationValidators,
    drivingLicenceValidators,
    vehicleInformationValidators,
    insuranceValidators,
    onboardingSectionValidators,
    selectedFieldValidators,
    submitOnboardingValidators,
} = require('../validators/captainOnboarding.validators');

const router = express.Router();

router.get('/onboarding', auth.authCaptain, captainOnboardingController.getOnboarding);

router.patch(
    '/onboarding/personal-information',
    auth.authCaptain,
    personalInformationValidators,
    captainOnboardingController.updatePersonalInformation,
);
router.patch(
    '/onboarding/identity-verification',
    auth.authCaptain,
    identityVerificationValidators,
    captainOnboardingController.updateIdentityVerification,
);
router.patch(
    '/onboarding/driving-licence',
    auth.authCaptain,
    drivingLicenceValidators,
    captainOnboardingController.updateDrivingLicence,
);
router.patch(
    '/onboarding/vehicle-information',
    auth.authCaptain,
    vehicleInformationValidators,
    captainOnboardingController.updateVehicleInformation,
);
router.patch(
    '/onboarding/insurance',
    auth.authCaptain,
    insuranceValidators,
    captainOnboardingController.updateInsurance,
);

router.post(
    '/onboarding/submit',
    auth.authCaptain,
    submitOnboardingValidators,
    captainOnboardingController.submitOnboarding,
);

router.get(
    '/onboarding/:section',
    auth.authCaptain,
    (req, res, next) => (req.query?.fields !== undefined ? next() : next('route')),
    selectedFieldValidators,
    captainOnboardingController.getOnboardingSectionFields,
);
router.get(
    '/onboarding/:section',
    auth.authCaptain,
    onboardingSectionValidators,
    captainOnboardingController.getOnboardingSection,
);

module.exports = router;
