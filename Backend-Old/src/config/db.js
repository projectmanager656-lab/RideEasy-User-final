const mongoose = require('mongoose');
const dns = require('dns');
const { getMongoUri } = require('./env');

// Configure fallback DNS servers (Google + Cloudflare) to ensure MongoDB Atlas SRV lookup succeeds
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
    // fallback gracefully if system restricts dns.setServers
}

const defaultLocalUri = 'mongodb://127.0.0.1:27017/rideeasy';

const mongooseOptions = {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 30_000),
    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 10),
};

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

let listenersAttached = false;
/** Cleared on disconnect so a new connection can be established. */
let connectInFlight = null;

async function connectToDb() {
    const mongoUri = getMongoUri() || defaultLocalUri;
    const maxAttempts = Math.max(1, Number(process.env.MONGO_CONNECT_RETRIES || 5));
    const retryMs = Math.max(0, Number(process.env.MONGO_CONNECT_RETRY_MS || 2000));

    if (!listenersAttached) {
        listenersAttached = true;
        mongoose.connection.on('disconnected', () => {
            console.warn('[MongoDB] disconnected');
            connectInFlight = null;
        });
        mongoose.connection.on('error', (err) => {
            console.error('[MongoDB] connection error:', err.message);
        });
    }

    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            await mongoose.connect(mongoUri, mongooseOptions);
            if (attempt > 1) {
                console.log(`MongoDB Connected ✅ (attempt ${attempt}/${maxAttempts})`);
            } else {
                console.log('MongoDB Connected ✅');
            }
            return;
        } catch (error) {
            lastError = error;
            console.error(
                `[MongoDB] connection attempt ${attempt}/${maxAttempts} failed:`,
                error.message,
            );
            if (attempt < maxAttempts) {
                console.warn(`[MongoDB] retrying in ${retryMs}ms...`);
                await sleep(retryMs);
            }
        }
    }

    console.error(
        '[MongoDB] All connection attempts failed. Local: start mongod or set MONGO_URI. Atlas: IP allowlist + URI.',
    );
    throw lastError;
}

/**
 * Idempotent: no-op if already connected. Safe for Express middleware (Vercel) and for server.listen startup.
 */
async function ensureDbConnected() {
    if (mongoose.connection.readyState === 1) {
        return;
    }
    if (!connectInFlight) {
        connectInFlight = connectToDb()
            .then(() => undefined)
            .catch((err) => {
                connectInFlight = null;
                throw err;
            });
    }
    await connectInFlight;
}

async function disconnectDb() {
    if (mongoose.connection.readyState === 0) return;
    connectInFlight = null;
    await mongoose.connection.close();
    console.log('[MongoDB] connection closed');
}

module.exports = connectToDb;
module.exports.disconnectDb = disconnectDb;
module.exports.ensureDbConnected = ensureDbConnected;
