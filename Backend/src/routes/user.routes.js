const express = require('express');
const { body } = require('express-validator');
const userController = require('../controllers/user.controller');
const rideController = require('../controllers/ride.controller');
const auth = require('../middlewares/auth.middleware');
const { loginRateLimit } = require('../middlewares/loginRateLimit.middleware');
const {
    registerUserValidators,
    loginValidators,
    phoneOtpSendValidators,
    phoneOtpVerifyValidators,
} = require('../validators/auth.validators');

const router = express.Router();

router.post('/register', registerUserValidators, userController.registerUser);

router.post('/login', loginRateLimit, loginValidators, userController.loginUser);

router.post('/phone/send-otp', phoneOtpSendValidators, userController.sendPhoneOtp);
router.post('/phone/verify-otp',
    phoneOtpVerifyValidators,
    userController.verifyPhoneOtp
);

router.get('/profile', auth.authUser, userController.getProfile);
router.get('/ride-history', auth.authUser, rideController.userRideHistory);

router.post('/onboarding/complete', userController.completeOnboarding);
router.get('/onboarding/status', userController.getOnboardingStatus);
router.patch('/profile',
    auth.authUser,
    body('name').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 80 }),
    body('savedAddresses').optional(),
    userController.updateProfile
);
router.get('/logout', auth.attachBearerToken, userController.logoutUser);

module.exports = router;

