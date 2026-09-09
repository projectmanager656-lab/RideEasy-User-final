const mongoose = require('mongoose');
const { verifyToken } = require('../config/jwt.config');
const userModel = require('../models/user.model');
const captainModel = require('../models/captain.model');
const adminModel = require('../models/admin.model');
const blackListTokenModel = require('../models/blackListToken.model');
const { fail } = require('../utils/apiResponse');

async function extractToken(req) {
    return bearerFromAuthorization(req) || req.cookies?.token || null;
}

/** Prefer `Authorization` over cookie so rider `token` cookie never overrides captain Bearer on logout. */
function bearerFromAuthorization(req) {
    const h = req.headers.authorization;
    if (typeof h !== 'string' || !h.trim()) return null;
    const m = /^Bearer\s+(.+)$/i.exec(h.trim());
    return m ? m[1].trim() : null;
}

/** Attach raw bearer token for logout (works even if JWT is expired). */
module.exports.attachBearerToken = (req, res, next) => {
    req.rawBearerToken = bearerFromAuthorization(req) || req.cookies?.token || null;
    next();
};

async function ensureNotBlacklisted(token) {
    if (!token) return;
    const isBlacklisted = await blackListTokenModel.findOne({ token });
    if (isBlacklisted) {
        const err = new Error('Unauthorized');
        err.status = 401;
        throw err;
    }
}

function normalizeUserId (raw) {
    if (raw == null || raw === '') return null;
    const s = String(raw);
    if (!mongoose.isValidObjectId(s)) return null;
    return new mongoose.Types.ObjectId(s);
}

module.exports.authUser = async (req, res, next) => {
    try {
        const token = await extractToken(req);
        if (!token) return fail(res, req, 401, 'Unauthorized');
        await ensureNotBlacklisted(token);
        const decoded = verifyToken(token);
        const uidRaw = decoded?._id ?? decoded?.id;
        const uid = normalizeUserId(uidRaw);
        if (!uid) {
            console.warn('[authUser] JWT missing or invalid user id', { uidRaw: uidRaw ?? null });
            return fail(res, req, 401, 'Unauthorized');
        }
        const user = await userModel.findById(uid);
        if (!user) {
            console.warn('[authUser] no user for id', String(uid));
            return fail(res, req, 401, 'Unauthorized');
        }
        if (user.blocked) return fail(res, req, 403, 'Account suspended');
        req.user = user;
        req.userId = user._id;
        return next();
    } catch (err) {
        if (err && err.message === 'JWT_SECRET is not configured') {
            return fail(res, req, 500, 'Server configuration error');
        }
        const status = Number(err?.status) || 401;
        if (status === 403) {
            return fail(res, req, 403, err?.message || 'Forbidden');
        }
        return fail(res, req, 401, 'Unauthorized');
    }
};

module.exports.authCaptain = async (req, res, next) => {
    try {
        const token = await extractToken(req);
        if (!token) return fail(res, req, 401, 'Unauthorized');
        await ensureNotBlacklisted(token);
        const decoded = verifyToken(token);
        const cid = decoded?._id ?? decoded?.id;
        if (!cid) return fail(res, req, 401, 'Unauthorized');
        const captain = await captainModel.findById(cid);
        if (!captain) return fail(res, req, 401, 'Unauthorized');
        if (captain.blocked) return fail(res, req, 403, 'Account suspended');
        req.captain = captain;
        return next();
    } catch (err) {
        if (err && err.message === 'JWT_SECRET is not configured') {
            return fail(res, req, 500, 'Server configuration error');
        }
        const status = Number(err?.status) || 401;
        if (status === 403) {
            return fail(res, req, 403, err?.message || 'Forbidden');
        }
        return fail(res, req, 401, 'Unauthorized');
    }
};

module.exports.authAdmin = async (req, res, next) => {
    try {
        const token = await extractToken(req);
        if (!token) return fail(res, req, 401, 'Unauthorized');
        await ensureNotBlacklisted(token);
        const decoded = verifyToken(token);
        if (decoded.role !== 'admin') return fail(res, req, 403, 'Forbidden');
        const aid = decoded?._id ?? decoded?.id;
        if (!aid) return fail(res, req, 401, 'Unauthorized');
        const admin = await adminModel.findById(aid);
        if (!admin) return fail(res, req, 401, 'Unauthorized');
        req.admin = admin;
        req.authId = admin._id;
        req.authRole = 'admin';
        return next();
    } catch (err) {
        if (err && err.message === 'JWT_SECRET is not configured') {
            return fail(res, req, 500, 'Server configuration error');
        }
        const status = Number(err?.status) || 401;
        if (status === 403) {
            return fail(res, req, 403, err?.message || 'Forbidden');
        }
        return fail(res, req, 401, 'Unauthorized');
    }
};

// Accept either user token or captain token.
module.exports.authUserOrCaptain = async (req, res, next) => {
    try {
        const token = await extractToken(req);
        if (!token) return fail(res, req, 401, 'Unauthorized');
        await ensureNotBlacklisted(token);
        const decoded = verifyToken(token);
        const idRaw = decoded?._id ?? decoded?.id;
        const oid = normalizeUserId(idRaw);
        if (!oid) return fail(res, req, 401, 'Unauthorized');

        const user = await userModel.findById(oid);
        if (user) {
            if (user.blocked) return fail(res, req, 403, 'Account suspended');
            req.user = user;
            req.userId = user._id;
            req.authRole = 'user';
            return next();
        }

        const captain = await captainModel.findById(oid);
        if (captain) {
            if (captain.blocked) return fail(res, req, 403, 'Account suspended');
            req.captain = captain;
            req.authRole = 'captain';
            return next();
        }

        return fail(res, req, 401, 'Unauthorized');
    } catch (err) {
        if (err && err.message === 'JWT_SECRET is not configured') {
            return fail(res, req, 500, 'Server configuration error');
        }
        const status = Number(err?.status) || 401;
        if (status === 403) {
            return fail(res, req, 403, err?.message || 'Forbidden');
        }
        return fail(res, req, 401, 'Unauthorized');
    }
};

