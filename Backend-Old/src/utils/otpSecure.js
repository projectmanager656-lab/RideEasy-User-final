const crypto = require('crypto');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 10;

function getKey() {
    const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
    return crypto.scryptSync(secret, 'ride-otp-salt-v1', 32);
}

/** AES-256-GCM so passenger can read OTP via authenticated GET (not via sockets). */
function encryptOtp(plainSixDigit) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const enc = Buffer.concat([ cipher.update(plainSixDigit, 'utf8'), cipher.final() ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([ iv, tag, enc ]).toString('base64');
}

function decryptOtp(b64) {
    if (!b64) return null;
    const buf = Buffer.from(b64, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([ decipher.update(enc), decipher.final() ]).toString('utf8');
}

async function hashOtp(plainSixDigit) {
    return bcrypt.hash(plainSixDigit, BCRYPT_ROUNDS);
}

async function verifyOtp(plainSixDigit, hash) {
    if (!plainSixDigit || !hash) return false;
    return bcrypt.compare(plainSixDigit, hash);
}

module.exports = {
    encryptOtp,
    decryptOtp,
    hashOtp,
    verifyOtp,
};
