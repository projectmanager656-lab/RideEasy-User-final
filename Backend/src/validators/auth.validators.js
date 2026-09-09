const { body } = require('express-validator');

const registerUserValidators = [
    body('name').isString().isLength({ min: 2 }),
    body('phone').isString().isLength({ min: 6 }),
    body('email').isEmail(),
    body('password').isString().isLength({ min: 6 }),
    // Empty string from UI must be ignored (otherwise min length fails when referral is optional).
    body('referredByCode').optional({ checkFalsy: true }).isString().trim().isLength({ min: 4, max: 24 }),
];

const registerCaptainValidators = [
    body('name').isString().isLength({ min: 2 }),
    body('phone').isString().isLength({ min: 6 }),
    body('email').isEmail(),
    body('password').isString().isLength({ min: 6 }),
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
