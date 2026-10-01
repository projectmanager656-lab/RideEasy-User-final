/**
 * Strip sensitive fields before sending user/captain documents in JSON responses.
 */
function toPublicDoc(doc) {
    if (!doc) return null;
    const o = doc.toObject ? doc.toObject({ virtuals: true }) : { ...doc };
    delete o.password;
    delete o.loginOtp;
    delete o.loginOtpExpiresAt;
    return o;
}

module.exports = { toPublicDoc };
