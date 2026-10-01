const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const captainModel = require('../models/captain.model');
const blackListTokenModel = require('../models/blackListToken.model');
const rideModel = require('../models/rideCore.model');
const { getAuthCookieOptions } = require('../utils/authCookie');
const { randomSixDigit, expiresInMinutes } = require('../utils/otp');
const { expiresAfterPlan, syncSubscriptionState, isSubscriptionValid } = require('../services/subscriptionDriver.service');
const { toPublicDoc } = require('../utils/publicDoc');
const { ok, fail } = require('../utils/apiResponse');
const { logLoginRequestBody } = require('../utils/loginDebug');
const pricingService = require('../services/pricing.service');
const driverService = require('../services/driver.service');
const { verifyBankDetails } = require('../utils/bankDetails');

function parseOptionalCaptainBankDetails (bankDetails, fallbackUpi) {
    if (!bankDetails || typeof bankDetails !== 'object') return { normalized: null };
    const holder = String(bankDetails.accountHolderName || '').trim();
    const acct = String(bankDetails.accountNumber || '').trim();
    const ifsc = String(bankDetails.ifscCode || '').trim();
    const upi = String(bankDetails.upiId || '').trim() || String(fallbackUpi || '').trim();
    const filled = [ holder, acct, ifsc, upi ].filter(Boolean).length;
    if (filled === 0) return { normalized: null };
    if (filled < 4) return { error: 'Provide all bank details (holder, account, IFSC, UPI) or omit the section.' };
    const v = verifyBankDetails({
        accountHolderName: holder,
        accountNumber: acct,
        ifscCode: ifsc,
        upiId: upi,
    });
    if (!v.ok) return { error: v.message };
    return { normalized: v.normalized };
}

module.exports.registerCaptain = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return fail(res, req, 400, 'Validation failed', { errors: errors.array() });

    const { name, phone, email, password, vehicleType, vehicleNumber, license, city } = req.body;
    const selectedPlan = [ 'weekly', 'monthly', 'yearly' ].includes(req.body?.subscriptionPlan) ? req.body.subscriptionPlan : 'monthly';
    const existing = await captainModel.findOne({ email: String(email).toLowerCase() });
    if (existing) return fail(res, req, 400, 'Driver already exist');

    const hashed = await captainModel.hashPassword(password);
    const started = new Date();
    const trialDays = await pricingService.getEffectiveLaunchTrialDays();
    let subscriptionExpiresAt;
    let subscriptionPlanVal;
    if (trialDays > 0) {
        subscriptionExpiresAt = new Date(started.getTime() + trialDays * 86400000);
        subscriptionPlanVal = 'trial';
    } else {
        subscriptionExpiresAt = expiresAfterPlan(selectedPlan, started);
        subscriptionPlanVal = selectedPlan;
    }
    const upiRaw = req.body?.upiId != null ? String(req.body.upiId).trim().toLowerCase() : '';
    const qrRaw = req.body?.paymentQrUrl != null ? String(req.body.paymentQrUrl).trim() : '';
    const bankParsed = parseOptionalCaptainBankDetails(req.body?.bankDetails, upiRaw);
    if (bankParsed.error) return fail(res, req, 400, bankParsed.error);
    const payeeUpi = upiRaw || (bankParsed.normalized && bankParsed.normalized.upiId) || '';
    const captain = await captainModel.create({
        name: String(name).trim(),
        phone: String(phone).trim(),
        email: String(email).toLowerCase().trim(),
        password: hashed,
        vehicleType: String(vehicleType).toUpperCase(),
        vehicleNumber: String(vehicleNumber).trim(),
        license: String(license).trim(),
        city: city || 'Kolhapur',
        status: 'active',
        isOnline: true,
        approved: true,
        subscriptionStatus: 'active',
        subscriptionPlan: subscriptionPlanVal,
        subscriptionStartedAt: started,
        subscriptionExpiresAt,
        ...(payeeUpi ? { upiId: payeeUpi } : {}),
        ...(qrRaw ? { paymentQrUrl: qrRaw.slice(0, 2048) } : {}),
        ...(bankParsed.normalized ? { bankDetails: bankParsed.normalized } : {}),
    });

    const token = captain.generateAuthToken();
    res.cookie('token', token, getAuthCookieOptions());
    return ok(res, req, 201, 'Captain registered', { token, captain: toPublicDoc(captain) });
};

module.exports.loginCaptain = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logLoginRequestBody('captains/login', req.body);
            return fail(res, req, 400, 'Validation failed', { errors: errors.array() });
        }
        logLoginRequestBody('captains/login', req.body);

        if (!process.env.JWT_SECRET) {
            console.error('[captains/login] JWT_SECRET is not set');
            return fail(res, req, 500, 'Server configuration error');
        }

        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = req.body?.password;
        if (typeof password !== 'string') {
            return fail(res, req, 400, 'Password is required');
        }

        const captain = await captainModel.findOne({ email }).select('+password');
        if (!captain) {
            return fail(res, req, 401, 'Invalid email or password');
        }

        const isPasswordValid = await captain.comparePassword(password);
        if (!isPasswordValid) {
            return fail(res, req, 401, 'Invalid email or password');
        }

        const fresh = await syncSubscriptionState(captain);
        const token = fresh.generateAuthToken();
        res.cookie('token', token, getAuthCookieOptions());
        const captainPublic = toPublicDoc(fresh);
        return ok(res, req, 200, 'Login successful', {
            token,
            captain: captainPublic,
            subscription: {
                status: fresh.subscriptionStatus,
                plan: fresh.subscriptionPlan || null,
                startedAt: fresh.subscriptionStartedAt || null,
                expiresAt: fresh.subscriptionExpiresAt || null,
            },
        });
    } catch (err) {
        console.error('[captains/login]', err);
        return fail(res, req, 500, 'Login failed');
    }
};

module.exports.getCaptainProfile = async (req, res) => {
    const fresh = await syncSubscriptionState(req.captain);
    return ok(res, req, 200, 'Profile fetched', {
        captain: toPublicDoc(fresh),
        subscription: {
            status: fresh.subscriptionStatus,
            plan: fresh.subscriptionPlan || null,
            startedAt: fresh.subscriptionStartedAt || null,
            expiresAt: fresh.subscriptionExpiresAt || null,
        },
    });
};

/** Update UPI / QR / bank details (optional fields). */
module.exports.updateCaptainPayee = async (req, res) => {
    const body = req.body || {};
    const patch = {};
    if (body.upiId !== undefined) patch.upiId = String(body.upiId || '').trim().toLowerCase().slice(0, 100);
    if (body.paymentQrUrl !== undefined) patch.paymentQrUrl = String(body.paymentQrUrl || '').trim().slice(0, 2048);
    if (body.bankDetails !== undefined) {
        const cap = req.captain;
        const fallbackUpi = body.upiId !== undefined ? String(body.upiId || '').trim().toLowerCase() : (cap.upiId || '');
        const parsed = parseOptionalCaptainBankDetails(body.bankDetails, fallbackUpi);
        if (parsed.error) return fail(res, req, 400, parsed.error);
        if (parsed.normalized) {
            patch.bankDetails = parsed.normalized;
            if (!patch.upiId && parsed.normalized.upiId) patch.upiId = parsed.normalized.upiId;
        } else {
            patch.bankDetails = {
                accountHolderName: '',
                accountNumber: '',
                ifscCode: '',
                upiId: '',
                verified: false,
                verifiedAt: null,
            };
        }
    }
    if (!Object.keys(patch).length) return fail(res, req, 400, 'Nothing to update');
    const updated = await captainModel.findByIdAndUpdate(req.captain._id, patch, { new: true });
    if (!updated) return fail(res, req, 404, 'Driver not found');
    return ok(res, req, 200, 'Profile updated', { captain: toPublicDoc(updated) });
};

module.exports.logoutCaptain = async (req, res) => {
    const token = req.rawBearerToken || req.cookies?.token || req.headers.authorization?.split(' ')[1];
    if (token) {
        try {
            await blackListTokenModel.create({ token });
        } catch (err) {
            if (err?.code !== 11000) {
                console.warn('[captains/logout] blacklist:', err?.message);
            }
        }
    }
    res.clearCookie('token', getAuthCookieOptions());
    return ok(res, req, 200, 'Logout successfully');
};

module.exports.updateStatus = async (req, res) => {
    const { status } = req.body || {};
    if (![ 'active', 'inactive' ].includes(status)) return res.status(400).json({ message: 'Status must be active or inactive' });
    if (status === 'inactive') {
        await captainModel.findByIdAndUpdate(req.captain._id, { status, isOnline: false });
        return res.status(200).json({ status });
    }
    let cap = await captainModel.findById(req.captain._id);
    cap = await syncSubscriptionState(cap);
    if (!cap.approved) {
        return res.status(403).json({ message: 'Admin approval required before going online.' });
    }
    if (cap.blocked) {
        return res.status(403).json({ message: 'Account blocked.' });
    }
    if (!isSubscriptionValid(cap)) {
        return res.status(403).json({ message: 'Active subscription required. Renew if expired.' });
    }
    await captainModel.findByIdAndUpdate(req.captain._id, { status, isOnline: true });
    return res.status(200).json({ status });
};

/** Prior trips with this passenger rated by this captain (for driver completion UI). */
module.exports.getPassengerRatingSummary = async (req, res) => {
    try {
        const userId = (req.query.userId || '').toString().trim();
        if (!mongoose.isValidObjectId(userId)) {
            return fail(res, req, 400, 'Invalid user id');
        }
        const capId = req.captain._id;
        const uid = new mongoose.Types.ObjectId(userId);
        const rows = await rideModel.aggregate([
            {
                $match: {
                    captain: capId,
                    user: uid,
                    captainPassengerRating: { $ne: null },
                },
            },
            {
                $group: {
                    _id: null,
                    avg: { $avg: '$captainPassengerRating' },
                    n: { $sum: 1 },
                },
            },
        ]);
        const row = rows[0];
        const avgRating = row && Number.isFinite(row.avg) ? Math.round(row.avg * 10) / 10 : null;
        return ok(res, req, 200, 'Summary', {
            avgRating,
            ratedTrips: row?.n || 0,
        });
    } catch (err) {
        return fail(res, req, 500, err.message || 'Summary failed');
    }
};

module.exports.getEarnings = async (req, res) => {
    try {
        const data = await driverService.getEarningsSummary(req.captain._id);
        return ok(res, req, 200, 'Earnings', data);
    } catch (err) {
        return fail(res, req, 500, err.message || 'Earnings failed');
    }
};

module.exports.getRideHistory = async (req, res) => {
    try {
        const limitRaw = Number(req.query?.limit);
        const limit = Number.isFinite(limitRaw)
            ? Math.min(100, Math.max(1, Math.floor(limitRaw)))
            : 40;
        const rides = await rideModel.find({ captain: req.captain._id })
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('user', 'name phone')
            .select('pickupLocation dropLocation price status createdAt completedAt vehicleType paymentMethod captainNetEarning user')
            .lean();
        return ok(res, req, 200, 'Ride history', { rides });
    } catch (err) {
        return fail(res, req, 500, err.message || 'History failed');
    }
};

module.exports.sendDriverPhoneOtp = async (req, res) => {
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    if (phone.length < 10) return res.status(400).json({ message: 'Valid phone required' });
    const captain = await captainModel.findOne({ phone }).select('+loginOtp +loginOtpExpiresAt');
    if (!captain) return res.status(404).json({ message: 'No driver with this phone — register first' });
    const otp = randomSixDigit();
    const exposeOtp = process.env.OTP_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
    captain.loginOtp = otp;
    captain.loginOtpExpiresAt = expiresInMinutes(5);
    await captain.save();
    return res.json({
        message: exposeOtp ? 'OTP generated (dev)' : 'OTP sent',
        expiresIn: 300,
        ...(exposeOtp ? { debugOtp: otp } : {}),
    });
};

module.exports.verifyDriverPhoneOtp = async (req, res) => {
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    const otp = String(req.body?.otp || '');
    if (phone.length < 10 || otp.length !== 6) return res.status(400).json({ message: 'Phone and OTP required' });
    const captain = await captainModel.findOne({ phone }).select('+loginOtp +loginOtpExpiresAt');
    if (!captain?.loginOtp) return res.status(400).json({ message: 'Request OTP first' });
    if (captain.loginOtp !== otp) return res.status(400).json({ message: 'Invalid OTP' });
    if (captain.loginOtpExpiresAt < new Date()) return res.status(400).json({ message: 'OTP expired' });
    captain.loginOtp = undefined;
    captain.loginOtpExpiresAt = undefined;
    await captain.save();
    const token = captain.generateAuthToken();
    return res.status(200).json({ token, captain: toPublicDoc(captain) });
};

