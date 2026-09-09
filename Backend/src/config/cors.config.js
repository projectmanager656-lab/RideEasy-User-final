/**
 * CORS for Express + Socket.IO (Render production + local dev).
 * Never use origin: '*' with credentials: true — browsers reject it.
 */

/** Explicit origins only — set CORS_ORIGINS in production (no implicit third-party domains). */
const FALLBACK_PRODUCTION_ORIGINS = [];

function parseOrigins() {
    const list = (process.env.CORS_ORIGINS || process.env.CLIENT_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const single = (process.env.FRONTEND_URL || process.env.FRONTEND_ORIGIN || '').trim();
    if (single) {
        list.push(single);
    }
    return [ ...new Set(list) ];
}

function isProductionLike() {
    return process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
}

function getAllowedOriginsList() {
    const fromEnv = parseOrigins();
    if (isProductionLike()) {
        return [ ...new Set([ ...fromEnv, ...FALLBACK_PRODUCTION_ORIGINS ]) ];
    }
    return fromEnv;
}

function isLocalDevOrigin(origin) {
    if (!origin) return false;
    return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);
}

/**
 * Vite "Network" URL (e.g. http://10.0.0.5:5173) — same machine/LAN dev; not production hosts.
 */
function isPrivateLanDevOrigin(origin) {
    if (!origin || isProductionLike()) return false;
    try {
        const u = new URL(origin);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
        const h = u.hostname;
        if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
        if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
        if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
        return false;
    } catch {
        return false;
    }
}

/**
 * Capacitor / Ionic Android WebView: with `androidScheme: "https"` the document origin is
 * `https://localhost` (not http). REST preflight must allow it. Remote `server.url` uses that HTTPS origin instead.
 */
function isCapacitorWebViewOrigin(origin) {
    if (!origin) return false;
    if (/^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
    if (/^capacitor:\/\/localhost/i.test(origin)) return true;
    if (/^ionic:\/\/localhost/i.test(origin)) return true;
    return false;
}

/** Optional: allow Vercel-hosted SPA when using capacitor `server.url` (origin is the site, not localhost). */
function isTrustedVercelAppOrigin(origin) {
    if (process.env.CORS_ALLOW_VERCEL_APP !== 'true') return false;
    return /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
}

/**
 * Shared Express + Socket.IO CORS decision: reflect `true` means callback(null, true) (non-browser / no Origin).
 */
function getCorsAllowReflection(origin) {
    const allowedList = getAllowedOriginsList();
    const isProd = isProductionLike();

    if (!origin) {
        return { allow: true, reflect: true };
    }

    if (isLocalDevOrigin(origin) || isPrivateLanDevOrigin(origin) || isCapacitorWebViewOrigin(origin) || isTrustedVercelAppOrigin(origin)) {
        return { allow: true, reflect: origin };
    }

    if (!allowedList.length) {
        if (isProd && process.env.CORS_ALLOW_ALL !== 'true') {
            return { allow: false };
        }
        return { allow: true, reflect: origin };
    }

    if (allowedList.includes(origin)) {
        return { allow: true, reflect: origin };
    }

    return { allow: false };
}

function logCorsDebugOnAllow(origin) {
    if (process.env.CORS_DEBUG !== 'true' || !origin) return;
    const allowedList = getAllowedOriginsList();
    if (isLocalDevOrigin(origin) || isPrivateLanDevOrigin(origin) || isCapacitorWebViewOrigin(origin) || isTrustedVercelAppOrigin(origin)) {
        console.log('[CORS] allow local / LAN / native WebView origin:', origin);
    } else if (!allowedList.length) {
        console.log('[CORS] allow (dev / CORS_ALLOW_ALL):', origin);
    } else if (allowedList.includes(origin)) {
        console.log('[CORS] allow listed origin:', origin);
    }
}

function corsOriginCallback(origin, cb) {
    const result = getCorsAllowReflection(origin);
    if (!result.allow) {
        const allowedList = getAllowedOriginsList();
        if (!allowedList.length && isProductionLike() && process.env.CORS_ALLOW_ALL !== 'true') {
            console.error('[CORS] blocked (no allowed origins):', origin);
        } else {
            console.error('[CORS] blocked origin:', origin, 'allowed:', allowedList);
        }
        return cb(null, false);
    }
    logCorsDebugOnAllow(origin);
    return cb(null, result.reflect === true ? true : result.reflect);
}

function expressCorsOptions() {
    return {
        origin: corsOriginCallback,
        credentials: true,
        methods: [ 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS' ],
        /** Include headers axios/browsers may send on cross-origin requests (otherwise preflight fails). */
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'Cache-Control',
            'Pragma',
            'Accept',
            'Origin',
        ],
        optionsSuccessStatus: 204,
    };
}

function socketIoCorsOrigin(origin, callback) {
    const result = getCorsAllowReflection(origin);
    if (!result.allow) {
        return callback(null, false);
    }
    return callback(null, result.reflect === true ? true : result.reflect);
}

function socketIoCorsConfig() {
    return {
        origin: socketIoCorsOrigin,
        methods: [ 'GET', 'POST' ],
        credentials: true,
    };
}

module.exports = {
    parseOrigins,
    getAllowedOriginsList,
    isProductionLike,
    isLocalDevOrigin,
    isPrivateLanDevOrigin,
    isCapacitorWebViewOrigin,
    isTrustedVercelAppOrigin,
    corsOriginCallback,
    expressCorsOptions,
    socketIoCorsConfig,
    FALLBACK_PRODUCTION_ORIGINS,
};
