/**
 * Strip sensitive fields before sending user/captain documents in JSON responses.
 */
function toPublicDoc(doc) {
    if (!doc) return null;
    const o = doc.toObject ? doc.toObject({ virtuals: true }) : { ...doc };
    delete o.password;
    delete o.loginOtp;
    delete o.loginOtpExpiresAt;
    delete o.bankDetails;
    // Legacy user records may retain these until the users-only migration is run.
    if (o.role === 'user' || doc?.constructor?.modelName === 'user' || doc?.constructor?.modelName === 'User') {
        delete o.city;
    }
    return o;
}

module.exports = { toPublicDoc };
