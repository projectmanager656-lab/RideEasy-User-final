const crypto = require('crypto');

function randomSixDigit() {
    return crypto.randomInt(100000, 999999).toString();
}

function expiresInMinutes(min) {
    return new Date(Date.now() + min * 60 * 1000);
}

module.exports = { randomSixDigit, expiresInMinutes };
