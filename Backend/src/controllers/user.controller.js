const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const userModel = require('../models/user.model');
const blackListTokenModel = require('../models/blackListToken.model');
const { randomSixDigit, expiresInMinutes } = require('../utils/otp');
const { getAuthCookieOptions } = require('../utils/authCookie');
const { toPublicDoc } = require('../utils/publicDoc');
const { ok, fail } = require('../utils/apiResponse');
const { verifyGoogleIdToken } = require('../utils/googleAuth');
const crypto = require('crypto');
const { logLoginRequestBody } = require('../utils/loginDebug');
const { verifyBankDetails } = require('../utils/bankDetails');

async function generateUniqueReferralCode(seed = '') {
    const base = String(seed || 'RIDE').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5) || 'RIDE';
    for (let i = 0; i < 8; i++) {
        const code = `${base}${randomSixDigit()}`;
        const exists = await userModel.findOne({ referralCode: code }).select('_id');
        if (!exists) return code;
    }
    return `RIDE${Date.now().toString().slice(-6)}`;
}

module.exports.registerUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return fail(res, req, 400, 'Validation failed', { errors: errors.array() });

    const { name, phone, email, password, city, bankDetails, referredByCode } = req.body;
    const existing = await userModel.findOne({ email: String(email).toLowerCase() });
    if (existing) return fail(res, req, 400, 'User already exists');

    const verification = verifyBankDetails(bankDetails || {});
    if (!verification.ok) return fail(res, req, 400, verification.message);

    const referralInput = String(referredByCode || '').trim().toUpperCase();
    let referrer = null;
    if (referralInput) {
        referrer = await userModel.findOne({ referralCode: referralInput }).select('_id');
        if (!referrer) return fail(res, req, 400, 'Invalid referral code');
    }

    const hashed = await userModel.hashPassword(password);
    const referralCode = await generateUniqueReferralCode(name || email || phone);
    const user = await userModel.create({
        name: String(name).trim(),
        phone: String(phone).trim(),
        email: String(email).toLowerCase().trim(),
        city: city || 'Kolhapur',
        bankDetails: verification.normalized,
        password: hashed,
        referralCode,
        referredBy: referrer?._id || null,
        referralOfferEligible: Boolean(referrer),
        referralOfferUsed: false,
    });

    const token = user.generateAuthToken();
    res.cookie('token', token, getAuthCookieOptions());
    return ok(res, req, 201, 'User registered', { token, user: toPublicDoc(user) });
};

module.exports.loginUser = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logLoginRequestBody('users/login', req.body);
            return fail(res, req, 400, 'Validation failed', { errors: errors.array() });
        }
        logLoginRequestBody('users/login', req.body);

        if (!process.env.JWT_SECRET) {
            console.error('[users/login] JWT_SECRET is not set');
            return fail(res, req, 500, 'Server configuration error');
        }

        const identifier = String(req.body?.identifier ?? req.body?.email ?? '').trim().toLowerCase();
        const password = req.body?.password;
        if (typeof password !== 'string') {
            return fail(res, req, 400, 'Password is required');
        }

        // "Email or phone number" login: digits-only input is treated as a phone.
        const isPhone = /^\d{10,}$/.test(identifier.replace(/[+\s-]/g, ''));
        const query = isPhone
            ? { phone: identifier.replace(/[+\s-]/g, '') }
            : { email: identifier };
        if (!identifier) {
            return fail(res, req, 400, 'Email or phone number is required');
        }

        const user = await userModel.findOne(query).select('+password +loginOtp +loginOtpExpiresAt');
        if (!user) {
            return fail(res, req, 401, 'Invalid credentials');
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return fail(res, req, 401, 'Invalid credentials');
        }

        // Password verified — second factor: send an OTP. The client verifies it
        // via /users/login/verify-otp, which returns the auth token.
        const otp = randomSixDigit();
        const exposeOtp = process.env.OTP_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
        user.loginOtp = otp;
        user.loginOtpExpiresAt = expiresInMinutes(5);
        await user.save({ validateBeforeSave: false });
        return ok(res, req, 200, 'Password verified — OTP sent', {
            passwordVerified: true,
            expiresIn: 300,
            ...(exposeOtp ? { debugOtp: otp } : {}),
        });
    } catch (err) {
        console.error('[users/login]', err);
        return fail(res, req, 500, 'Login failed');
    }
};

module.exports.googleLogin = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return fail(res, req, 400, 'Validation failed', { errors: errors.array() });
        }

        let payload;
        try {
            payload = await verifyGoogleIdToken(req.body?.idToken);
        } catch (err) {
            console.error('[users/google] token verification failed:', err.message);
            return fail(res, req, 401, 'Google sign-in failed. Please try again.');
        }

        const email = String(payload.email).toLowerCase().trim();
        let user = await userModel.findOne({ email });
        if (!user) {
            // First Google sign-in for this email → auto-create the account.
            const googlePhone = `g${String(payload.sub).replace(/\D/g, '').slice(0, 10)}`;
            const randomPassword = crypto.randomBytes(24).toString('hex');
            user = await userModel.create({
                name: String(payload.name || email.split('@')[0]).trim(),
                email,
                phone: googlePhone,
                city: 'Kolhapur',
                password: await userModel.hashPassword(randomPassword),
                referralCode: await generateUniqueReferralCode(email),
            });
        }

        const token = user.generateAuthToken();
        res.cookie('token', token, getAuthCookieOptions());
        const created = user.createdAt?.getTime() > Date.now() - 10_000;
        return ok(res, req, created ? 201 : 200, created ? 'Account created' : 'Login successful', { token, user: toPublicDoc(user) });
    } catch (err) {
        console.error('[users/google]', err);
        return fail(res, req, 500, 'Google sign-in failed');
    }
};

module.exports.checkUserExists = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return fail(res, req, 400, 'Validation failed', { errors: errors.array() });
        }

        const identifier = String(req.body?.identifier ?? '').trim().toLowerCase();
        // Digits-only input is treated as a phone (mirrors loginUser).
        const isPhone = /^\d{10,}$/.test(identifier.replace(/[+\s-]/g, ''));
        const query = isPhone
            ? { phone: identifier.replace(/[+\s-]/g, '') }
            : { email: identifier };
        if (!identifier) {
            return fail(res, req, 400, 'Email or phone number is required');
        }

        const exists = Boolean(await userModel.findOne(query).select('_id'));
        return ok(res, req, 200, 'Account check complete', { exists });
    } catch (err) {
        console.error('[users/check-user]', err);
        return fail(res, req, 500, 'Account check failed');
    }
};

module.exports.getProfile = async (req, res) => {
     if (!req.user?._id) {
         console.error('[users/profile GET] req.user missing');
         return fail(res, req, 401, 'Unauthorized');
     }
     return ok(res, req, 200, 'Profile fetched', { user: toPublicDoc(req.user) });
 };

 module.exports.getEmergencyContact = async (req, res) => {
     if (!req.user?._id) {
         console.error('[users/emergency-contact GET] req.user missing');
         return fail(res, req, 401, 'Unauthorized');
     }
     
     try {
         const user = await userModel.findById(req.user._id).select('emergencyContact');
         if (!user) {
             return fail(res, req, 404, 'User not found');
         }
         
         // If no emergency contact exists, return 404 to indicate it needs to be created
         if (!user.emergencyContact || !user.emergencyContact.name) {
             return fail(res, req, 404, 'Emergency contact not found');
         }
         
         return ok(res, req, 200, 'Emergency contact fetched', { emergencyContact: user.emergencyContact });
     } catch (err) {
         console.error('[users/emergency-contact GET]', err);
         return fail(res, req, 500, 'Could not fetch emergency contact');
     }
 };

 module.exports.saveEmergencyContact = async (req, res) => {
     if (!req.user?._id) {
         console.error('[users/emergency-contact POST] req.user missing');
         return fail(res, req, 401, 'Unauthorized');
     }

     const errors = validationResult(req);
     if (!errors.isEmpty()) return fail(res, req, 400, 'Validation failed', { errors: errors.array() });

     const { name, phone, relationship } = req.body || {};

     // Validation
     if (!name || String(name).trim() === '') {
         return fail(res, req, 400, 'Emergency contact name is required');
     }
     
     const trimmedName = String(name).trim();
     if (trimmedName.length < 2) {
         return fail(res, req, 400, 'Emergency contact name must be at least 2 characters');
     }
     
     if (!phone || !/^[6-9]\d{9}$/.test(String(phone).replace(/\D/g, ''))) {
         return fail(res, req, 400, 'Valid 10-digit phone number is required');
     }
     
     const validRelationships = ['family', 'friend', 'parent', 'spouse', 'other'];
     if (!relationship || !validRelationships.includes(relationship)) {
         return fail(res, req, 400, 'Valid relationship is required');
     }

     try {
         const user = await userModel.findById(req.user._id);
         if (!user) {
             return fail(res, req, 404, 'User not found');
         }

         // Update emergency contact information
         user.emergencyContact = {
             name: trimmedName,
             phone: String(phone).replace(/\D/g, ''), // Store only digits
             relationship
         };

         await user.save({ validateModifiedOnly: true });
         return ok(res, req, 200, 'Emergency contact saved', { emergencyContact: user.emergencyContact });
     } catch (err) {
         console.error('[users/emergency-contact POST]', err);
         return fail(res, req, 500, 'Could not save emergency contact');
     }
 };

 module.exports.deleteEmergencyContact = async (req, res) => {
     if (!req.user?._id) {
         console.error('[users/emergency-contact DELETE] req.user missing');
         return fail(res, req, 401, 'Unauthorized');
     }

     try {
         const user = await userModel.findById(req.user._id);
         if (!user) {
             return fail(res, req, 404, 'User not found');
         }

         // Clear emergency contact information
         user.emergencyContact = {
             name: '',
             phone: '',
             relationship: ''
         };

         await user.save({ validateModifiedOnly: true });
         return ok(res, req, 200, 'Emergency contact deleted');
     } catch (err) {
         console.error('[users/emergency-contact DELETE]', err);
         return fail(res, req, 500, 'Could not delete emergency contact');
     }
 };

 function toUserObjectId (raw) {
    if (raw == null) return null;
    try {
        if (raw instanceof mongoose.Types.ObjectId) return raw;
        const nested = typeof raw === 'object' && raw._id != null ? raw._id : raw;
        const s = String(nested);
        return mongoose.isValidObjectId(s) ? new mongoose.Types.ObjectId(s) : null;
    } catch {
        return null;
    }
}

module.exports.updateProfile = async (req, res) => {
    const uidRaw = req.userId || req.user?._id;
    const oid = toUserObjectId(uidRaw);
    if (!oid) {
        console.error('[users/profile PATCH] invalid user id', { uidRaw });
        return fail(res, req, 401, 'Unauthorized');
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) return fail(res, req, 400, 'Validation failed', { errors: errors.array() });

    const { name, savedAddresses } = req.body || {};
    const $set = {};

    if (name != null && String(name).trim() !== '') {
        const n = String(name).trim();
        if (n.length < 2 || n.length > 80) return fail(res, req, 400, 'Name must be 2–80 characters');
        $set.name = n;
    }

    if (savedAddresses != null) {
        if (typeof savedAddresses !== 'object' || Array.isArray(savedAddresses)) {
            return fail(res, req, 400, 'savedAddresses must be an object');
        }
        if (savedAddresses.home !== undefined) {
            $set['savedAddresses.home'] = String(savedAddresses.home || '').trim().slice(0, 500);
        }
        if (savedAddresses.work !== undefined) {
            $set['savedAddresses.work'] = String(savedAddresses.work || '').trim().slice(0, 500);
        }
    }

    if (Object.keys($set).length === 0) {
        return fail(res, req, 400, 'Provide name and/or savedAddresses to update');
    }

    try {
        const user = await userModel.findById(oid);
        if (!user) {
            console.error('[users/profile PATCH] findById returned null', String(oid));
            return fail(res, req, 404, 'User not found');
        }
        if ($set.name != null) user.name = $set.name;
        if ($set['savedAddresses.home'] !== undefined) {
            user.savedAddresses = user.savedAddresses || {};
            user.savedAddresses.home = $set['savedAddresses.home'];
        }
        if ($set['savedAddresses.work'] !== undefined) {
            user.savedAddresses = user.savedAddresses || {};
            user.savedAddresses.work = $set['savedAddresses.work'];
        }
        await user.save({ validateModifiedOnly: true });
        return ok(res, req, 200, 'Profile updated', { user: toPublicDoc(user) });
    } catch (err) {
        console.error('[users/profile PATCH]', err?.message || err, err?.stack);
        return fail(res, req, 500, 'Could not update profile');
    }
};

module.exports.logoutUser = async (req, res) => {
    const token = req.rawBearerToken || req.cookies?.token || req.headers.authorization?.split(' ')[1];
    if (token) {
        try {
            await blackListTokenModel.create({ token });
        } catch (err) {
            if (err?.code !== 11000) {
                console.warn('[users/logout] blacklist:', err?.message);
            }
        }
    }
    res.clearCookie('token', getAuthCookieOptions());
    return ok(res, req, 200, 'Logout successfully');
};

/** Phone OTP — persisted on user; deliver via SMS provider in production (use OTP_DEBUG for dev). */
module.exports.sendPhoneOtp = async (req, res) => {
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    if (phone.length < 10) return res.status(400).json({ message: 'Valid phone required' });

    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();

    // Registration-flow duplicate detection: refuse OTP for accounts that already
    // exist with the same phone (a real account) or the same email.
    // A pending loginOtp means the same user is mid-verification (resend allowed).
    // Phone-only requests (OTP login / forgot-password recovery) keep working for
    // existing accounts — matching the original endpoint behaviour.
    const isRegistration = Boolean(name || email);
    if (isRegistration) {
        const existingByPhone = phone
            ? await userModel.findOne({ phone }).select('+password +loginOtp')
            : null;
        const syntheticPhoneEmail = /^\+?\d+@phone\.rideeasy\.local$/i.test(existingByPhone?.email || '');
        // A pending loginOtp means the same user is mid-verification — a resend
        // is allowed, but only for the exact same email (a different email means
        // someone else is trying to register with an already-used phone).
        if (existingByPhone && !syntheticPhoneEmail) {
            const pendingResend = Boolean(existingByPhone.loginOtp)
                && (!email || String(existingByPhone.email).toLowerCase() === String(email).toLowerCase());
            if (!pendingResend) {
                return res.status(409).json({
                    message: 'An account already exists with this phone number. Please log in instead.',
                });
            }
        }
        if (email) {
            const existingByEmail = await userModel.findOne({ email }).select('_id');
            // Same phone user mid-verification is a resend — not a duplicate.
            if (existingByEmail
                && (!existingByPhone || !existingByEmail._id.equals(existingByPhone._id))) {
                return res.status(409).json({
                    message: 'An account already exists with this email. Please log in instead.',
                });
            }
        }
    }

    const otp = randomSixDigit();
    const exposeOtp = process.env.OTP_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
    let user = await userModel.findOne({ phone });
    if (!user) {
        const hasRealEmail = /@/.test(email);
        const syntheticEmail = `${phone}@phone.rideeasy.local`;
        const hashed = await userModel.hashPassword(randomSixDigit() + 'Aa1!');
        user = await userModel.create({
            name: name || 'Phone user',
            phone,
            email: hasRealEmail ? email : syntheticEmail,
            password: hashed,
        });
    }
    user = await userModel.findById(user._id).select('+loginOtp +loginOtpExpiresAt');
    user.loginOtp = otp;
    user.loginOtpExpiresAt = expiresInMinutes(5);
    await user.save();
    return res.json({
        message: exposeOtp ? 'OTP generated (dev)' : 'OTP sent',
        expiresIn: 300,
        ...(exposeOtp ? { debugOtp: otp } : {}),
    });
};

/** Login OTP — sends a 6-digit OTP to an existing account (email or phone). */
module.exports.sendLoginOtp = async (req, res) => {
    try {
        const identifier = String(req.body?.identifier || '').trim().toLowerCase();
        if (identifier.length < 3) {
            return res.status(400).json({ message: 'Email or phone number is required' });
        }
        // "Email or phone number" semantics: digits-only input is treated as a phone.
        const isPhone = /^\d{10,}$/.test(identifier.replace(/[+\s-]/g, ''));
        const query = isPhone
            ? { phone: identifier.replace(/[+\s-]/g, '') }
            : { email: identifier };
        const user = await userModel.findOne(query).select('+loginOtp +loginOtpExpiresAt');
        if (!user) {
            return res.status(404).json({ message: 'No account found with this email or phone' });
        }
        const otp = randomSixDigit();
        const exposeOtp = process.env.OTP_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
        user.loginOtp = otp;
        user.loginOtpExpiresAt = expiresInMinutes(5);
        // Only OTP fields change — skip re-validating unrelated doc fields.
        await user.save({ validateBeforeSave: false });
        return res.json({
            message: exposeOtp ? 'OTP generated (dev)' : 'OTP sent',
            expiresIn: 300,
            ...(exposeOtp ? { debugOtp: otp } : {}),
        });
    } catch (err) {
        console.error('[users/login/send-otp]', err);
        return res.status(500).json({ message: 'Failed to send OTP' });
    }
};

/** Login OTP verification — returns a token + user, exactly like a successful login. */
module.exports.verifyLoginOtp = async (req, res) => {
    try {
        const identifier = String(req.body?.identifier || '').trim().toLowerCase();
        const otp = String(req.body?.otp || '');
        if (identifier.length < 3 || otp.length !== 6) {
            return res.status(400).json({ message: 'Identifier and 6-digit OTP required' });
        }
        const isPhone = /^\d{10,}$/.test(identifier.replace(/[+\s-]/g, ''));
        const query = isPhone
            ? { phone: identifier.replace(/[+\s-]/g, '') }
            : { email: identifier };
        const user = await userModel.findOne(query).select('+loginOtp +loginOtpExpiresAt');
        if (!user?.loginOtp) return res.status(400).json({ message: 'Request OTP first' });
        if (user.loginOtp !== otp) return res.status(400).json({ message: 'Invalid OTP' });
        if (user.loginOtpExpiresAt < new Date()) return res.status(400).json({ message: 'OTP expired' });
        user.loginOtp = undefined;
        user.loginOtpExpiresAt = undefined;
        await user.save({ validateBeforeSave: false });
        const token = user.generateAuthToken();
        res.cookie('token', token, getAuthCookieOptions());
        return ok(res, req, 200, 'Login successful', { token, user: toPublicDoc(user) });
    } catch (err) {
        console.error('[users/login/verify-otp]', err);
        return res.status(500).json({ message: 'Failed to verify OTP' });
    }
};

module.exports.verifyPhoneOtp = async (req, res) => {
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    const otp = String(req.body?.otp || '');
    const name = req.body?.name;
    if (phone.length < 10 || otp.length !== 6) {
        return res.status(400).json({ message: 'Phone and 6-digit OTP required' });
    }
    const user = await userModel.findOne({ phone }).select('+loginOtp +loginOtpExpiresAt');
    if (!user?.loginOtp) return res.status(400).json({ message: 'Request OTP first' });
    if (user.loginOtp !== otp) return res.status(400).json({ message: 'Invalid OTP' });
    if (user.loginOtpExpiresAt < new Date()) return res.status(400).json({ message: 'OTP expired' });
    user.loginOtp = undefined;
    user.loginOtpExpiresAt = undefined;
    if (name && String(name).trim().length >= 2) user.name = String(name).trim();
    // Registration passes the password the user chose on the signup form —
    // store it so they can log in with it. Phone-OTP login / forgot-password
    // send no password and stay unchanged.
    const signupPassword = req.body?.password;
    if (typeof signupPassword === 'string' && signupPassword.length >= 6) {
        user.password = await userModel.hashPassword(signupPassword);
    }
    await user.save();
    const token = user.generateAuthToken();
    return res.status(200).json({ token, user: toPublicDoc(user) });
};

/** Change password for the authenticated user (session/JWT → req.user). */
module.exports.changePassword = async (req, res) => {
    if (!req.user?._id) {
        console.error('[users/change-password] req.user missing');
        return fail(res, req, 401, 'Unauthorized');
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) return fail(res, req, 400, 'Validation failed', { errors: errors.array() });

    const currentPassword = req.body?.currentPassword;
    const newPassword = req.body?.newPassword;

    if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
        return fail(res, req, 400, 'Current password is required');
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
        return fail(res, req, 400, 'New password must be at least 6 characters');
    }

    try {
        // Fetch the user with the password hash (select:false by default).
        const user = await userModel.findById(req.user._id).select('+password');
        if (!user) {
            return fail(res, req, 404, 'User not found');
        }

        const isCurrentValid = await user.comparePassword(currentPassword);
        if (!isCurrentValid) {
            return fail(res, req, 400, 'Current password is incorrect');
        }

        const isSamePassword = await user.comparePassword(newPassword);
        if (isSamePassword) {
            return fail(res, req, 400, 'New password must be different from your current password');
        }

        user.password = await userModel.hashPassword(newPassword);
        await user.save({ validateModifiedOnly: true });

        return ok(res, req, 200, 'Password changed successfully');
    } catch (err) {
        console.error('[users/change-password]', err);
        return fail(res, req, 500, 'Unable to change password right now. Please try again.');
    }
};

