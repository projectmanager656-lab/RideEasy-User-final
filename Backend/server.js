require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const { ensureDbConnected, disconnectDb } = require('./src/config/db');
const { initializeSocket } = require('./src/socket');
const { getAllowedOriginsList } = require('./src/config/cors.config');

const port = process.env.PORT || 5001;

/**
 * Mounts (see app.js): /users (POST /login, /register, …), /captains (POST /login, …),
 * /maps, /rides, /admin, /driver-subscriptions, /health, POST /webhooks/razorpay, Socket.IO on same server.
 */

const server = http.createServer(app);
initializeSocket(server, app);

function gracefulShutdown(signal) {
    console.log(`[shutdown] ${signal}`);
    server.close(async () => {
        try {
            await disconnectDb();
        } catch (e) {
            console.error('[shutdown] Mongo close error:', e.message);
        }
        process.exit(0);
    });
    setTimeout(() => {
        console.error('[shutdown] force exit after timeout');
        process.exit(1);
    }, 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

async function start() {
    try {
        await ensureDbConnected();
    } catch (err) {
        console.error('[server] MongoDB required to start:', err?.message || err);
        process.exit(1);
    }

    server.listen(port, () => {
        const base = `http://localhost:${port}`;
        console.log(`REST + Socket.IO: ${base}`);
        console.log(`Server is running on port ${port}`);
        console.log(`[CORS] NODE_ENV=${process.env.NODE_ENV || 'development'}`);
        if (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') {
            console.log('[CORS] Socket.IO + REST allow origins:', getAllowedOriginsList());
        }
    });
}

start();
