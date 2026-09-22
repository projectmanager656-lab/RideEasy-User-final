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
router.post('/phone/login-send-otp', phoneOtpSendValidators, userController.sendPhoneLoginOtp);
router.post('/phone/verify-otp',
    phoneOtpVerifyValidators,
    userController.verifyPhoneOtp
);
router.post('/google', userController.googleLogin);

router.get('/profile', auth.authUser, userController.getProfile);
router.get('/wallet', auth.authUser, userController.getWallet);
router.get('/coupons', auth.authUser, userController.getCoupons);
router.post('/coupons/validate', auth.authUser, body('code').isString().isLength({ min: 1, max: 40 }), body('fare').isNumeric(), userController.validateCoupon);
router.get('/ride-history', auth.authUser, rideController.userRideHistory);
router.get('/emergency-contact', auth.authUser, userController.getEmergencyContact);
router.post('/emergency-contact', auth.authUser, userController.saveEmergencyContact);
router.delete('/emergency-contact', auth.authUser, userController.deleteEmergencyContact);

// Recent Searches
router.get('/recent-searches', auth.authUser, userController.getRecentSearches);
router.post('/recent-searches', auth.authUser, userController.createRecentSearch);
router.delete('/recent-searches', auth.authUser, userController.clearRecentSearches);
router.delete('/recent-searches/:id', auth.authUser, userController.deleteRecentSearch);

// Saved Locations
router.get('/saved-locations', auth.authUser, userController.getSavedLocations);
router.post('/saved-locations', auth.authUser, userController.createSavedLocation);
router.put('/saved-locations/:id', auth.authUser, userController.updateSavedLocation);
router.delete('/saved-locations/:id', auth.authUser, userController.deleteSavedLocation);

// Device Push Token
router.post('/device-token', auth.authUser, userController.saveDeviceToken);
router.delete('/device-token', auth.authUser, userController.removeDeviceToken);

// In-app notifications (Home notification sheet)
router.get('/notifications', auth.authUser, userController.listNotifications);
router.post('/notifications/:id/read', auth.authUser, userController.markNotificationRead);

// SOS Emergency
router.post('/sos', auth.authUser, userController.triggerSos);
router.get('/sos/active', auth.authUser, userController.getActiveSos);
router.post('/sos/deactivate', auth.authUser, userController.deactivateSos);

// Secure Wallet Razorpay recharge
router.post('/wallet/create-razorpay-order', auth.authUser, userController.createWalletRazorpayOrder);
router.post('/wallet/verify-razorpay-payment', auth.authUser, userController.verifyWalletRazorpayPayment);

// Wallet Top-up
router.post('/wallet/topup', auth.authUser, userController.topupWallet);

router.post('/onboarding/complete', userController.completeOnboarding);
router.get('/onboarding/status', userController.getOnboardingStatus);
router.patch('/profile',
    auth.authUser,
    body('name').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 80 }),
    body('savedAddresses').optional(),
    userController.updateProfile
);
router.post('/change-password',
    auth.authUser,
    body('currentPassword').isString().isLength({ min: 1, max: 128 }),
    body('newPassword').isString().isLength({ min: 6, max: 128 }),
    userController.changePassword
);

// Safety screen toggles
router.get('/safety-prefs', auth.authUser, userController.getSafetyPrefs);
router.patch('/safety-prefs', auth.authUser, userController.updateSafetyPrefs);
router.get('/logout', auth.attachBearerToken, userController.logoutUser);

module.exports = router;

