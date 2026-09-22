const Razorpay = require("razorpay");
const crypto = require("crypto");
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
const WalletTransaction = require('../models/walletTransaction.model');
const RecentSearch = require('../models/recentSearch.model');
const SavedLocation = require('../models/savedLocation.model');
const SosEvent = require('../models/sosEvent.model');
const EmergencyContact = require('../models/emergencyContact.model');
const notificationService = require('../services/notification.service');
const { listAvailableCoupons, validateCoupon } = require('../services/coupon.service');

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

module.exports.getWallet = async (req, res) => {
    const userId = toUserObjectId(req.user?._id || req.userId);
    if (!userId) return fail(res, req, 401, 'Unauthorized');
    const [user, transactions] = await Promise.all([
        userModel.findById(userId).select('walletBalance').lean(),
        WalletTransaction.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(),
    ]);
    return ok(res, req, 200, 'Wallet fetched', {
        wallet: { balance: Number(user?.walletBalance || 0), transactions },
    });
};

module.exports.getCoupons = async (req, res) => {
    const userId = toUserObjectId(req.user?._id || req.userId);
    if (!userId) return fail(res, req, 401, 'Unauthorized');
    return ok(res, req, 200, 'Coupons fetched', { coupons: await listAvailableCoupons(userId) });
};

module.exports.validateCoupon = async (req, res) => {
    const userId = toUserObjectId(req.user?._id || req.userId);
    if (!userId) return fail(res, req, 401, 'Unauthorized');
    try {
        const result = await validateCoupon({ code: req.body?.code, userId, fare: req.body?.fare });
        return ok(res, req, 200, 'Coupon validated', {
            coupon: result.coupon,
            discountAmount: result.discountAmount,
            finalFare: result.finalFare,
            excessDiscount: result.excessDiscount || 0,
        });
    } catch (err) {
        return fail(res, req, err.statusCode || 400, err.message);
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

function publicEmergencyContact (doc) {
    if (!doc?.name) return null;
    return { name: doc.name, phone: doc.phone || '', relationship: doc.relationship || '' };
}

const SAFETY_PREF_KEYS = ['shareTripAutomatically', 'shareLiveLocation', 'safetyNotifications'];
const DEFAULT_SAFETY_PREFS = {
    shareTripAutomatically: false,
    shareLiveLocation: true,
    safetyNotifications: true,
};

/** Always returns all three toggles, falling back to the defaults for unset values. */
function publicSafetyPrefs (user) {
    const stored = user?.safetyPrefs || {};
    const out = {};
    for (const key of SAFETY_PREF_KEYS) {
        out[key] = stored[key] == null ? DEFAULT_SAFETY_PREFS[key] : Boolean(stored[key]);
    }
    return out;
}

module.exports.getSafetyPrefs = async (req, res) => {
    const user = await userModel.findById(req.user?._id).select('safetyPrefs').lean();
    if (!user) return fail(res, req, 404, 'User not found');
    return ok(res, req, 200, 'Safety preferences fetched', { safetyPrefs: publicSafetyPrefs(user) });
};

module.exports.updateSafetyPrefs = async (req, res) => {
    const body = req.body || {};
    const patch = {};
    for (const key of SAFETY_PREF_KEYS) {
        if (body[key] === undefined) continue;
        if (typeof body[key] !== 'boolean') {
            return fail(res, req, 400, `${key} must be a boolean`);
        }
        patch[`safetyPrefs.${key}`] = body[key];
    }
    if (Object.keys(patch).length === 0) {
        return fail(res, req, 400, 'No safety preference provided');
    }
    const user = await userModel
        .findByIdAndUpdate(req.user?._id, { $set: patch }, { new: true })
        .select('safetyPrefs')
        .lean();
    if (!user) return fail(res, req, 404, 'User not found');
    return ok(res, req, 200, 'Safety preferences updated', { safetyPrefs: publicSafetyPrefs(user) });
};

/** Change the signed-in passenger's password. Requires the current password. */
module.exports.changePassword = async (req, res) => {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!currentPassword) return fail(res, req, 400, 'Current password is required');
    if (newPassword.length < 6) return fail(res, req, 400, 'New password must be at least 6 characters');

    const user = await userModel.findById(req.user?._id).select('+password');
    if (!user) return fail(res, req, 404, 'User not found');

    const valid = await user.comparePassword(currentPassword);
    if (!valid) return fail(res, req, 401, 'Current password is incorrect');

    user.password = await userModel.hashPassword(newPassword);
    await user.save();
    return ok(res, req, 200, 'Password changed successfully');
};

module.exports.getEmergencyContact = async (req, res) => {
    const userId = req.user?._id;
    let contact = await EmergencyContact.findOne({ userId, isActive: true }).sort({ updatedAt: -1 }).lean();
    if (!contact) {
        // Legacy fallback: contact stored on the user document.
        const user = await userModel.findById(userId).select('emergencyContact').lean();
        if (user?.emergencyContact?.name) contact = user.emergencyContact;
    }
    return ok(res, req, 200, 'Emergency contact fetched', {
        emergencyContact: publicEmergencyContact(contact),
    });
};

module.exports.saveEmergencyContact = async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    const relationship = String(req.body?.relationship || '').trim();
    if (name.length < 2 || phone.length !== 10 || !relationship) {
        return fail(res, req, 400, 'Valid emergency contact details are required');
    }
    const userId = req.user?._id;
    const contact = await EmergencyContact.findOneAndUpdate(
        { userId },
        { $set: { name, phone, relationship, isActive: true } },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
    ).lean();
    // Mirror onto the user document so existing admin/SOS views keep working.
    await userModel.findByIdAndUpdate(userId, { $set: { emergencyContact: { name, phone, relationship } } });
    return ok(res, req, 200, 'Emergency contact saved', { emergencyContact: publicEmergencyContact(contact) });
};

module.exports.deleteEmergencyContact = async (req, res) => {
    const userId = req.user?._id;
    await EmergencyContact.deleteMany({ userId });
    await userModel.findByIdAndUpdate(userId, { $set: { emergencyContact: { name: '', phone: '', relationship: '' } } });
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

/** Recent Searches */
module.exports.getRecentSearches = async (req, res) => {
    try {
        const userId = req.user?._id;
        const list = await RecentSearch.find({ userId }).sort({ createdAt: -1 }).limit(10).lean();
        return ok(res, req, 200, 'Recent searches fetched', { recentSearches: list });
    } catch (err) {
        return fail(res, req, 500, err.message || 'Failed to fetch recent searches');
    }
};

module.exports.createRecentSearch = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { pickup, destination, pickupCoords, dropCoords, detail } = req.body || {};
        if (!pickup || !destination) {
            return fail(res, req, 400, 'Pickup and destination are required');
        }
        // Deduplicate recent search
        await RecentSearch.deleteMany({ userId, pickup: String(pickup).trim(), destination: String(destination).trim() });
        const record = await RecentSearch.create({
            userId,
            pickup: String(pickup).trim(),
            destination: String(destination).trim(),
            pickupCoords: pickupCoords || null,
            dropCoords: dropCoords || null,
            detail: detail || '',
        });
        return ok(res, req, 201, 'Recent search saved', { recentSearch: record });
    } catch (err) {
        return fail(res, req, 500, err.message || 'Failed to save recent search');
    }
};

module.exports.deleteRecentSearch = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { id } = req.params;
        await RecentSearch.deleteOne({ _id: id, userId });
        return ok(res, req, 200, 'Recent search deleted');
    } catch (err) {
        return fail(res, req, 500, err.message || 'Failed to delete recent search');
    }
};

module.exports.clearRecentSearches = async (req, res) => {
    try {
        const userId = req.user?._id;
        await RecentSearch.deleteMany({ userId });
        return ok(res, req, 200, 'Recent searches cleared');
    } catch (err) {
        return fail(res, req, 500, err.message || 'Failed to clear recent searches');
    }
};

/** Saved Locations */
module.exports.getSavedLocations = async (req, res) => {
    try {
        const userId = req.user?._id;
        const list = await SavedLocation.find({ userId }).sort({ updatedAt: -1 }).lean();
        return ok(res, req, 200, 'Saved locations fetched', { savedLocations: list });
    } catch (err) {
        return fail(res, req, 500, err.message || 'Failed to fetch saved locations');
    }
};

module.exports.createSavedLocation = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { type = 'other', label, address, latitude, longitude } = req.body || {};
        if (!address) return fail(res, req, 400, 'Address is required');

        const saved = await SavedLocation.create({
            userId,
            type: ['home', 'work', 'favorite', 'other'].includes(type) ? type : 'other',
            label: label || '',
            address: String(address).trim(),
            latitude: latitude != null ? Number(latitude) : null,
            longitude: longitude != null ? Number(longitude) : null,
        });

        // Sync with user's quick savedAddresses if home or work
        if (type === 'home' || type === 'work') {
            await userModel.findByIdAndUpdate(userId, {
                $set: { [`savedAddresses.${type}`]: String(address).trim() },
            });
        }

        return ok(res, req, 201, 'Saved location created', { savedLocation: saved });
    } catch (err) {
        return fail(res, req, 500, err.message || 'Failed to create saved location');
    }
};

module.exports.updateSavedLocation = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { id } = req.params;
        const { type, label, address, latitude, longitude } = req.body || {};
        const update = {};
        if (type) update.type = type;
        if (label !== undefined) update.label = label;
        if (address) update.address = String(address).trim();
        if (latitude !== undefined) update.latitude = Number(latitude);
        if (longitude !== undefined) update.longitude = Number(longitude);

        const updated = await SavedLocation.findOneAndUpdate({ _id: id, userId }, { $set: update }, { new: true });
        if (!updated) return fail(res, req, 404, 'Saved location not found');

        if (updated.type === 'home' || updated.type === 'work') {
            await userModel.findByIdAndUpdate(userId, {
                $set: { [`savedAddresses.${updated.type}`]: updated.address },
            });
        }

        return ok(res, req, 200, 'Saved location updated', { savedLocation: updated });
    } catch (err) {
        return fail(res, req, 500, err.message || 'Failed to update saved location');
    }
};

module.exports.deleteSavedLocation = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { id } = req.params;
        const deleted = await SavedLocation.findOneAndDelete({ _id: id, userId });
        if (!deleted) return fail(res, req, 404, 'Saved location not found');

        if (deleted.type === 'home' || deleted.type === 'work') {
            await userModel.findByIdAndUpdate(userId, {
                $set: { [`savedAddresses.${deleted.type}`]: '' },
            });
        }
        return ok(res, req, 200, 'Saved location deleted');
    } catch (err) {
        return fail(res, req, 500, err.message || 'Failed to delete saved location');
    }
};

/** Device Push Token */
module.exports.saveDeviceToken = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { token, platform, appVersion } = req.body || {};
        if (!token) return fail(res, req, 400, 'Token is required');
        const record = await notificationService.registerDeviceToken({
            userId,
            role: 'user',
            token,
            platform,
            appVersion,
        });
        return ok(res, req, 200, 'Device token saved', { deviceToken: record });
    } catch (err) {
        return fail(res, req, 500, err.message || 'Failed to save device token');
    }
};

module.exports.removeDeviceToken = async (req, res) => {
    try {
        const { token } = req.body || {};
        if (!token) return fail(res, req, 400, 'Token is required');
        await notificationService.removeDeviceToken(token);
        return ok(res, req, 200, 'Device token removed');
    } catch (err) {
        return fail(res, req, 500, err.message || 'Failed to remove device token');
    }
};

/** SOS Emergency */
module.exports.triggerSos = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { rideId } = req.body || {};
        // Accept both `{ lat, lng }` and the frontend shape `{ location: { lat, lng } }`.
        const lat = req.body?.lat ?? req.body?.location?.lat;
        const lng = req.body?.lng ?? req.body?.location?.lng;
        const hasCoords = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
        const location = hasCoords
            ? { type: 'Point', coordinates: [Number(lng), Number(lat)] }
            : undefined;

        const event = await SosEvent.create({
            userId,
            rideId: rideId || null,
            location,
            status: 'triggered',
        });

        // Broadcast to admin room via Socket.IO
        const socketModule = require('../socket');
        const io = socketModule.getIo();
        if (io) {
            io.to('admin').emit('admin:sos', {
                sosId: event._id,
                userId,
                rideId,
                location,
                status: 'triggered',
                createdAt: event.createdAt,
            });
        }

        // Persist notification for user & admin
        await notificationService.createPersisted({
            receiverId: userId,
            receiverType: 'user',
            title: 'SOS Emergency Activated',
            message: 'Your emergency alert has been broadcast to RideEasy safety operations.',
            type: 'system',
            meta: { sosId: event._id },
        });

        return ok(res, req, 201, 'SOS emergency triggered', { sosEvent: event });
    } catch (err) {
        return fail(res, req, 500, err.message || 'Failed to trigger SOS');
    }
};

module.exports.getActiveSos = async (req, res) => {
    try {
        const userId = req.user?._id;
        const active = await SosEvent.findOne({
            userId,
            status: { $in: ['triggered', 'acknowledged'] },
        }).sort({ createdAt: -1 });
        return ok(res, req, 200, 'SOS status fetched', { activeSos: active });
    } catch (err) {
        return fail(res, req, 500, err.message || 'Failed to fetch active SOS');
    }
};

module.exports.deactivateSos = async (req, res) => {
    try {
        const userId = req.user?._id;
        await SosEvent.updateMany(
            { userId, status: { $in: ['triggered', 'acknowledged'] } },
            { $set: { status: 'resolved', resolvedAt: new Date(), resolutionNotes: 'Deactivated by user' } },
        );
        return ok(res, req, 200, 'SOS deactivated');
    } catch (err) {
        return fail(res, req, 500, err.message || 'Failed to deactivate SOS');
    }
};


/**
 * Create Razorpay order for wallet recharge.
 * Wallet is NOT credited here.
 */
module.exports.createWalletRazorpayOrder = async (req, res) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const amount = Number(req.body?.amount);

        if (!userId) {
            return fail(res, req, 401, "Authentication required");
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            return fail(res, req, 400, "Invalid wallet amount");
        }

        if (amount > 1000000) {
            return fail(res, req, 400, "Maximum wallet top-up is ₹10,00,000");
        }

        const keyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
        const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();

        if (!keyId || !keySecret) {
            return fail(res, req, 500, "Razorpay configuration is missing");
        }

        const razorpay = new Razorpay({
            key_id: keyId,
            key_secret: keySecret
        });

        const order = await razorpay.orders.create({
            amount: Math.round(amount * 100),
            currency: "INR",
            receipt: `wallet_${String(userId).slice(-8)}_${Date.now()}`,
            notes: {
                userId: String(userId),
                paymentType: "wallet_topup"
            }
        });

        return ok(res, req, 200, "Wallet payment order created", {
            orderId: order.id,
            amount,
            currency: "INR",
            keyId
        });
    } catch (err) {
        return fail(
            res,
            req,
            500,
            err.message || "Failed to create wallet payment order"
        );
    }
};

/**
 * Verify Razorpay wallet payment.
 * Wallet is credited ONLY after signature verification.
 */
module.exports.verifyWalletRazorpayPayment = async (req, res) => {
    try {
        const userId = req.user?._id || req.user?.id;

        const {
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            amount
        } = req.body || {};

        if (!userId) {
            return fail(res, req, 401, "Authentication required");
        }

        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return fail(res, req, 400, "Razorpay payment details are required");
        }

        const secret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();

        if (!secret) {
            return fail(res, req, 500, "Razorpay secret is not configured");
        }

        const expectedSignature = crypto
            .createHmac("sha256", secret)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest("hex");

        if (expectedSignature !== razorpaySignature) {
            return fail(res, req, 400, "Invalid payment signature");
        }

        const topupAmount = Number(amount);

        if (!Number.isFinite(topupAmount) || topupAmount <= 0) {
            return fail(res, req, 400, "Invalid wallet amount");
        }

        if (topupAmount > 1000000) {
            return fail(res, req, 400, "Invalid wallet amount");
        }

        const reference = `razorpay_wallet_${razorpayPaymentId}`;

        // Idempotency: don't credit the same Razorpay payment twice.
        const existing = await WalletTransaction.findOne({
            reference
        }).lean();

        if (existing) {
            const currentUser = await userModel
                .findById(userId)
                .select("walletBalance")
                .lean();

            return ok(res, req, 200, "Wallet payment already processed", {
                walletBalance: Number(currentUser?.walletBalance || 0),
                transaction: existing,
                alreadyProcessed: true
            });
        }

        const updatedUser = await userModel.findByIdAndUpdate(
            userId,
            {
                $inc: {
                    walletBalance: topupAmount
                }
            },
            {
                new: true
            }
        ).select("walletBalance");

        if (!updatedUser) {
            return fail(res, req, 404, "User not found");
        }

        const transaction = await WalletTransaction.create({
            userId,
            rideId: null,
            amount: topupAmount,
            direction: "credit",
            status: "success",
            reference,
            description: `Wallet recharge via Razorpay`
        });

        return ok(res, req, 200, "Wallet recharged successfully", {
            walletBalance: Number(updatedUser.walletBalance || 0),
            transaction,
            alreadyProcessed: false
        });
    } catch (err) {
        // If another request already created the unique reference,
        // return the current wallet instead of crediting twice.
        if (err?.code === 11000) {
            const userId = req.user?._id || req.user?.id;
            const currentUser = await userModel
                .findById(userId)
                .select("walletBalance")
                .lean();

            return ok(res, req, 200, "Wallet payment already processed", {
                walletBalance: Number(currentUser?.walletBalance || 0),
                alreadyProcessed: true
            });
        }

        return fail(
            res,
            req,
            500,
            err.message || "Wallet payment verification failed"
        );
    }
};


/** Wallet Top-Up */
module.exports.topupWallet = async (req, res) => {
    try {
        const userId = req.user?._id;
        const amount = Number(req.body?.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            return fail(res, req, 400, 'Valid positive amount is required');
        }

        const updatedUser = await userModel.findByIdAndUpdate(
            userId,
            { $inc: { walletBalance: amount } },
            { new: true },
        ).select('walletBalance');

        const tx = await WalletTransaction.create({
            userId,
            amount,
            direction: 'credit',
            status: 'success',
            reference: `topup_${Date.now()}_${userId}`,
            description: `Wallet top-up of ₹${amount}`,
        });

        return ok(res, req, 200, 'Wallet topped up successfully', {
            walletBalance: updatedUser.walletBalance,
            transaction: tx,
        });
    } catch (err) {
        return fail(res, req, 500, err.message || 'Wallet topup failed');
    }
};

