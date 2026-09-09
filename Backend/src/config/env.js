/**
 * Production env validation and shared getters (Mongo URI, etc.).
 * Call validateEnv() once after dotenv.config().
 */

function isProductionLike() {
    return process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
}

/**
 * Atlas / local connection string. Supports MONGO_URI (preferred) and MONGODB_URI (common Atlas docs alias).
 */
function getMongoUri() {
    const raw = process.env.MONGO_URI || process.env.MONGODB_URI || '';
    return typeof raw === 'string' ? raw.trim() : '';
}

const WEAK_JWT_HINTS = [ 'change-me', 'secret', 'your_jwt', 'your-jwt' ];

function isWeakJwtSecret(secret) {
    const s = (secret || '').trim();
    if (s.length < 32) return true;
    const lower = s.toLowerCase();
    return WEAK_JWT_HINTS.some((h) => lower.includes(h));
}

function warnDevelopmentEnv() {
    if (isProductionLike()) {
        return;
    }
    if (!process.env.JWT_SECRET || typeof process.env.JWT_SECRET !== 'string') {
        console.warn('[env] JWT_SECRET is missing — authenticated routes will fail until you set it in backend/.env');
    }
    const mongoUri = getMongoUri();
    if (!mongoUri) {
        console.warn('[env] MONGO_URI / MONGODB_URI unset — using local default mongodb://127.0.0.1:27017/rideeasy');
    }
}

function validateEnv() {
    if (!isProductionLike()) {
        return;
    }

    const mongoUri = getMongoUri();
    if (!mongoUri) {
        console.error('[env] Production requires MONGO_URI or MONGODB_URI (MongoDB Atlas connection string).');
        process.exit(1);
    }

    const jwt = process.env.JWT_SECRET;
    if (!jwt || typeof jwt !== 'string' || isWeakJwtSecret(jwt)) {
        console.error('[env] Production requires JWT_SECRET: at least 32 random characters, not a placeholder.');
        process.exit(1);
    }

    const corsRaw = (process.env.CORS_ORIGINS || process.env.CLIENT_ORIGINS || '').trim();
    const frontendUrl = (process.env.FRONTEND_URL || process.env.FRONTEND_ORIGIN || '').trim();
    if (!corsRaw && !frontendUrl && process.env.CORS_ALLOW_ALL !== 'true') {
        console.error('[env] Production requires CORS_ORIGINS (or FRONTEND_URL), or CORS_ALLOW_ALL=true.');
        process.exit(1);
    }
}

/**
 * Launch trial length for new driver registrations (days). 0 = disabled; use selected subscription plan at signup instead.
 */
function getLaunchTrialDays() {
    const raw = process.env.RIDEEASY_LAUNCH_TRIAL_DAYS;
    if (raw == null || String(raw).trim() === '') return 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(Math.floor(n), 365);
}

module.exports = {
    isProductionLike,
    getMongoUri,
    validateEnv,
    warnDevelopmentEnv,
    getLaunchTrialDays,
};
