const jwt = require('jsonwebtoken');

const DEFAULT_EXPIRES_IN = '24h';

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || typeof secret !== 'string') {
        throw new Error('JWT_SECRET is not configured');
    }
    return secret;
}

function signPayload(payload, options = {}) {
    return jwt.sign(payload, getJwtSecret(), {
        expiresIn: process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRES_IN,
        ...options,
    });
}

function verifyToken(token, options = {}) {
    return jwt.verify(token, getJwtSecret(), options);
}

module.exports = {
    getJwtSecret,
    signPayload,
    verifyToken,
    DEFAULT_EXPIRES_IN,
};
