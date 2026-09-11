const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const userModel = require('../models/user.model');
const blackListTokenModel = require('../models/blackListToken.model');
const userOnboardingModel = require('../models/userOnboarding.model');
const { randomSixDigit, expiresInMinutes } = require('../utils/otp');
const { getAuthCookieOptions } = require('../utils/authCookie');
const { toPublicDoc } = require('../utils/publicDoc');
const { ok, fail } = require('../utils/apiResponse');
const { logLoginRequestBody } = require('../utils/loginDebug');
const axios = require('axios');

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

    const { name, phone, email, password, referredByCode } = req.body;
    const existing = await userModel.findOne({ email: String(email).toLowerCase() });
    if (existing) return fail(res, req, 400, 'User already exists');

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

        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = req.body?.password;
        if (typeof password !== 'string') {
            return fail(res, req, 400, 'Password is required');
        }

        const user = await userModel.findOne({ email }).select('+password');
        if (!user) {
            return fail(res, req, 401, 'Invalid email or password');
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return fail(res, req, 401, 'Invalid email or password');
        }

        const token = user.generateAuthToken();
        res.cookie('token', token, getAuthCookieOptions());
        return ok(res, req, 200, 'Login successful', { token, user: toPublicDoc(user) });
    } catch (err) {
        console.error('[users/login]', err);
        return fail(res, req, 500, 'Login failed');
    }
};

module.exports.getProfile = async (req, res) => {
    if (!req.user?._id) {
        console.error('[users/profile GET] req.user missing');
        return fail(res, req, 401, 'Unauthorized');
    }
    return ok(res, req, 200, 'Profile fetched', { user: toPublicDoc(req.user) });
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
    if (!/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ message: 'Valid phone required' });
    const isRegistration = req.body?.registration === true;
    const requestedEmail = String(req.body?.email || '').trim().toLowerCase();
    const requestedName = String(req.body?.name || '').trim();
    if (isRegistration && !requestedEmail) {
        return res.status(400).json({ message: 'Email is required to create an account' });
    }
    if (requestedEmail && !/^\S+@\S+\.\S+$/.test(requestedEmail)) {
        return res.status(400).json({ message: 'Valid email required' });
    }
    const otp = randomSixDigit();
    const exposeOtp = process.env.OTP_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
    let user = await userModel.findOne({ phone });
    if (isRegistration && user) {
        return res.status(409).json({ message: 'An account with this phone number already exists' });
    }
    if (!user && requestedEmail) {
        user = await userModel.findOne({ email: requestedEmail });
        if (user && String(user.phone || '').replace(/\D/g, '') !== phone) {
            return res.status(409).json({ message: 'An account already uses this email' });
        }
    }
    if (isRegistration && user) {
        return res.status(409).json({ message: 'An account with this email already exists' });
    }
    if (!user) {
        if (!requestedEmail) {
            return res.status(404).json({ message: 'No account found for this phone number. Create an account with a real email address first.' });
        }
        const hashed = await userModel.hashPassword(randomSixDigit() + 'Aa1!');
        user = await userModel.create({
            name: requestedName.length >= 2 ? requestedName : 'Phone user',
            phone,
            email: requestedEmail,
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

module.exports.sendPhoneLoginOtp = async (req, res) => {
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ message: 'Valid phone required' });
    const user = await userModel.findOne({ phone });
    if (!user) return res.status(404).json({ message: 'No account found for this phone number' });
    const otp = randomSixDigit();
    const exposeOtp = process.env.OTP_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
    const secured = await userModel.findById(user._id).select('+loginOtp +loginOtpExpiresAt');
    secured.loginOtp = otp;
    secured.loginOtpExpiresAt = expiresInMinutes(5);
    await secured.save();
    return res.json({ message: exposeOtp ? 'OTP generated (dev)' : 'OTP sent', expiresIn: 300, ...(exposeOtp ? { debugOtp: otp } : {}) });
};

module.exports.googleLogin = async (req, res) => {
    const idToken = String(req.body?.idToken || '').trim();
    if (!idToken || !process.env.GOOGLE_CLIENT_ID) return fail(res, req, 503, 'Google sign-in is not configured');
    try {
        const response = await axios.get('https://oauth2.googleapis.com/tokeninfo', { params: { id_token: idToken }, timeout: 10000 });
        const profile = response.data;
        if (profile.aud !== process.env.GOOGLE_CLIENT_ID || profile.email_verified !== 'true') {
            return fail(res, req, 401, 'Google sign-in verification failed');
        }
        const email = String(profile.email || '').trim().toLowerCase();
        if (!email) return fail(res, req, 401, 'Google account email missing');
        let user = await userModel.findOne({ email });
        if (!user) {
            const password = await userModel.hashPassword(`${randomSixDigit()}-${Date.now()}-Google!`);
            user = await userModel.create({
                name: String(profile.name || email.split('@')[0]).trim().slice(0, 80),
                phone: `google-${String(profile.sub || Date.now())}`,
                email,
                password,
            });
        }
        return ok(res, req, 200, 'Google login successful', { token: user.generateAuthToken(), user: toPublicDoc(user) });
    } catch (err) {
        return fail(res, req, 401, 'Google sign-in verification failed');
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
    if (req.body?.password && String(req.body.password).length >= 6) {
        user.password = await userModel.hashPassword(String(req.body.password));
    }
    await user.save();
    const token = user.generateAuthToken();
    return res.status(200).json({ token, user: toPublicDoc(user) });
};

module.exports.getEmergencyContact = async (req, res) => {
    const user = await userModel.findById(req.user?._id).select('emergencyContact');
    if (!user) return fail(res, req, 404, 'User not found');
    return ok(res, req, 200, 'Emergency contact fetched', {
        emergencyContact: user.emergencyContact?.name ? user.emergencyContact : null,
    });
};

module.exports.saveEmergencyContact = async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    const relationship = String(req.body?.relationship || '').trim();
    if (name.length < 2 || phone.length !== 10 || !relationship) {
        return fail(res, req, 400, 'Valid emergency contact details are required');
    }
    const user = await userModel.findByIdAndUpdate(
        req.user?._id,
        { $set: { emergencyContact: { name, phone, relationship } } },
        { new: true, runValidators: true },
    ).select('emergencyContact');
    if (!user) return fail(res, req, 404, 'User not found');
    return ok(res, req, 200, 'Emergency contact saved', { emergencyContact: user.emergencyContact });
};

module.exports.deleteEmergencyContact = async (req, res) => {
    const user = await userModel.findByIdAndUpdate(
        req.user?._id,
        { $set: { emergencyContact: { name: '', phone: '', relationship: '' } } },
        { new: true },
    ).select('emergencyContact');
    if (!user) return fail(res, req, 404, 'User not found');
    return ok(res, req, 200, 'Emergency contact deleted', { emergencyContact: null });
};

/** Persist per-device onboarding completion (client provides a stable deviceId). */
module.exports.completeOnboarding = async (req, res) => {
    const deviceId = String(req.body?.deviceId || '').trim();
    if (!deviceId) return fail(res, req, 400, 'deviceId is required');

    try {
        await userOnboardingModel.findOneAndUpdate(
            { deviceId },
            { $set: { onboarded: true } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        return ok(res, req, 200, 'Onboarding marked complete', { onboarded: true });
    } catch (err) {
        console.error('[users/onboarding/complete]', err?.message || err);
        return fail(res, req, 500, 'Could not save onboarding state');
    }
};

/** Return the server-side onboarding state for a deviceId (non-destructive, no auth). */
module.exports.getOnboardingStatus = async (req, res) => {
    const deviceId = String(req.query?.deviceId || '').trim();
    if (!deviceId) return fail(res, req, 400, 'deviceId is required');

    try {
        const record = await userOnboardingModel.findOne({ deviceId }).select('onboarded');
        return ok(res, req, 200, 'Onboarding status fetched', {
            onboarded: Boolean(record?.onboarded),
        });
    } catch (err) {
        console.error('[users/onboarding/status]', err?.message || err);
        return fail(res, req, 500, 'Could not fetch onboarding state');
    }
};

