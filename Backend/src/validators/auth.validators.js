const { body } = require('express-validator');

const registerUserValidators = [
    body('name').isString().isLength({ min: 2 }),
    body('phone').isString().isLength({ min: 6 }),
    body('email').isEmail(),
    body('password').isString().isLength({ min: 6 }),
    body('city').optional().isIn([ 'Kolhapur', 'Ichalkaranji', 'Sangli' ]),
    body('bankDetails.accountHolderName').isString().isLength({ min: 2 }),
    body('bankDetails.accountNumber').isString().isLength({ min: 9, max: 18 }),
    body('bankDetails.ifscCode').isString().isLength({ min: 11, max: 11 }),
    body('bankDetails.upiId').isString().isLength({ min: 5 }),
    // Empty string from UI must be ignored (otherwise min length fails when referral is optional).
    body('referredByCode').optional({ checkFalsy: true }).isString().trim().isLength({ min: 4, max: 24 }),
];

const registerCaptainValidators = [
    body('name').isString().isLength({ min: 2 }),
    body('phone').isString().isLength({ min: 6 }),
    body('email').isEmail(),
    body('password').isString().isLength({ min: 6 }),
    body('vehicleType').isString().isIn([ 'BIKE', 'AUTO', 'CAR' ]),
    body('vehicleNumber').isString().isLength({ min: 3 }),
    body('license').isString().isLength({ min: 5 }),
    body('city').optional().isIn([ 'Kolhapur', 'Ichalkaranji', 'Sangli' ]),
    body('subscriptionPlan').optional().isIn([ 'weekly', 'monthly', 'yearly' ]),
    body('upiId').optional({ checkFalsy: true }).isString().isLength({ min: 5, max: 100 }),
    body('paymentQrUrl').optional({ checkFalsy: true }).isString().isLength({ max: 2048 }),
];

const loginValidators = [
    body('email').isEmail(),
    body('password').isString().isLength({ min: 1 }),
];

const phoneOtpSendValidators = [
    body('phone').isString().isLength({ min: 10 }),
];

const phoneOtpVerifyValidators = [
    body('phone').isString().isLength({ min: 10 }),
    body('otp').isString().isLength({ min: 6, max: 6 }),
];

module.exports = {
    registerUserValidators,
    registerCaptainValidators,
    loginValidators,
    phoneOtpSendValidators,
    phoneOtpVerifyValidators,
};
