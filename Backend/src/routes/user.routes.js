const express = require('express');
const { body } = require('express-validator');
const userController = require('../controllers/user.controller');
const rideController = require('../controllers/ride.controller');
const onboardingController = require('../controllers/onboarding.controller');
const auth = require('../middlewares/auth.middleware');
const { loginRateLimit } = require('../middlewares/loginRateLimit.middleware');
const {
    registerUserValidators,
    loginValidators,
    phoneOtpSendValidators,
    phoneOtpVerifyValidators,
    checkUserValidators,
    googleLoginValidators,
    loginOtpSendValidators,
    loginOtpVerifyValidators,
} = require('../validators/auth.validators');

const router = express.Router();

router.post('/register', registerUserValidators, userController.registerUser);

router.post('/login', loginRateLimit, loginValidators, userController.loginUser);

router.post('/google', googleLoginValidators, userController.googleLogin);

router.post('/check-user', checkUserValidators, userController.checkUserExists);

router.get('/onboarding/status', onboardingController.getOnboardingStatus);
router.post('/onboarding/status', onboardingController.getOnboardingStatus);
router.post('/onboarding/complete', onboardingController.markOnboardingComplete);

router.post('/login/send-otp', loginOtpSendValidators, userController.sendLoginOtp);
router.post('/login/verify-otp', loginOtpVerifyValidators, userController.verifyLoginOtp);

router.post('/phone/send-otp', phoneOtpSendValidators, userController.sendPhoneOtp);
router.post('/phone/verify-otp',
    phoneOtpVerifyValidators,
    userController.verifyPhoneOtp
);

router.get('/profile', auth.authUser, userController.getProfile);
router.get('/ride-history', auth.authUser, rideController.userRideHistory);
router.get('/emergency-contact', auth.authUser, userController.getEmergencyContact);
router.post('/emergency-contact',
    auth.authUser,
    body('name').optional({ checkFalsy: true }).trim().isLength({ min: 2 }),
    body('phone').optional({ checkFalsy: true }).matches(/^[6-9]\d{9}$/),
    body('relationship').optional({ checkFalsy: true }).isIn(['family', 'friend', 'parent', 'spouse', 'other']),
    userController.saveEmergencyContact
);
router.delete('/emergency-contact', auth.authUser, userController.deleteEmergencyContact);
router.post('/change-password',
    auth.authUser,
    body('currentPassword').isString().notEmpty(),
    body('newPassword').isString().isLength({ min: 6 }),
    userController.changePassword
);
router.patch('/profile',
    auth.authUser,
    body('name').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 80 }),
    body('savedAddresses').optional(),
    userController.updateProfile
);
router.get('/logout', auth.attachBearerToken, userController.logoutUser);

module.exports = router;

