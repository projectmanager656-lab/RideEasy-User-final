/**
 * OTP generation & verification for rides (delegates to secure utils).
 */
const crypto = require('crypto');
const { expiresInMinutes } = require('../utils/otp');
const { encryptOtp, hashOtp, verifyOtp, decryptOtp } = require('../utils/otpSecure');

function randomDigits (numDigits) {
    return crypto.randomInt(Math.pow(10, numDigits - 1), Math.pow(10, numDigits)).toString();
}

module.exports = {
    encryptOtp,
    decryptOtp,
    hashOtp,
    verifyOtp,
    expiresInMinutes,
    randomDigits,
};
