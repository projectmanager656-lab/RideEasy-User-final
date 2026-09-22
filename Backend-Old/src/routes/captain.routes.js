const express = require('express');
const captainController = require('../controllers/captain.controller');
const auth = require('../middlewares/auth.middleware');
const { loginRateLimit } = require('../middlewares/loginRateLimit.middleware');
const {
    registerCaptainValidators,
    loginValidators,
    phoneOtpSendValidators,
    phoneOtpVerifyValidators,
} = require('../validators/auth.validators');

const router = express.Router();

router.post('/register', registerCaptainValidators, captainController.registerCaptain);

router.post('/login', loginRateLimit, loginValidators, captainController.loginCaptain);

router.post('/phone/send-otp', phoneOtpSendValidators, captainController.sendDriverPhoneOtp);
router.post('/phone/verify-otp',
    phoneOtpVerifyValidators,
    captainController.verifyDriverPhoneOtp
);

router.get('/profile', auth.authCaptain, captainController.getCaptainProfile);
router.patch('/profile', auth.authCaptain, captainController.updateCaptainPayee);
router.get('/rides/history', auth.authCaptain, captainController.getRideHistory);
router.get('/earnings', auth.authCaptain, captainController.getEarnings);
router.get('/passenger-rating-summary', auth.authCaptain, captainController.getPassengerRatingSummary);
router.post('/status', auth.authCaptain, captainController.updateStatus);
router.get('/logout', auth.attachBearerToken, captainController.logoutCaptain);

module.exports = router;

