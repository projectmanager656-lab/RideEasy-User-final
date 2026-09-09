/**
 * Lightweight in-memory login limiter (per process).
 * Keyed by IP + email to slow brute-force attempts.
 */
const ATTEMPTS = new Map();

const WINDOW_MS = Number(process.env.LOGIN_RATE_WINDOW_MS || (15 * 60 * 1000));
const MAX_ATTEMPTS = Number(process.env.LOGIN_RATE_MAX || 10);

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')?.[0]?.trim() || req.ip || 'unknown';
}

function loginRateLimit(req, res, next) {
    const email = String(req.body?.email || '').trim().toLowerCase() || 'unknown';
    const key = `${getClientIp(req)}|${email}`;
    const now = Date.now();

    const entry = ATTEMPTS.get(key);
    if (!entry || now > entry.expiresAt) {
        ATTEMPTS.set(key, { count: 1, expiresAt: now + WINDOW_MS });
        return next();
    }

    if (entry.count >= MAX_ATTEMPTS) {
        const retryAfterSec = Math.ceil((entry.expiresAt - now) / 1000);
        res.setHeader('Retry-After', String(Math.max(retryAfterSec, 1)));
        return res.status(429).json({
            ok: false,
            message: 'Too many login attempts. Please try again later.',
            retryAfterSeconds: Math.max(retryAfterSec, 1),
            requestId: req.requestId,
        });
    }

    entry.count += 1;
    ATTEMPTS.set(key, entry);
    return next();
}

module.exports = { loginRateLimit };
