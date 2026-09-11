const { body } = require('express-validator');

const registerUserValidators = [
    body('name').isString().trim().matches(/^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/).isLength({ min: 2, max: 80 }),
    body('phone').isString().isLength({ min: 6 }),
    body('email').customSanitizer((value) => String(value || '').trim().toLowerCase()).isEmail(),
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
    body('phone').isString().matches(/^[6-9]\d{9}$/),
];

const phoneOtpVerifyValidators = [
    body('phone').isString().matches(/^[6-9]\d{9}$/),
    body('otp').isString().isLength({ min: 6, max: 6 }),
];

module.exports = {
    registerUserValidators,
    registerCaptainValidators,
    loginValidators,
    phoneOtpSendValidators,
    phoneOtpVerifyValidators,
};
