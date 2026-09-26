require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const { ensureDbConnected, disconnectDb } = require('./src/config/db');
const { releaseStaleCouponReservations } = require('./src/services/coupon.service');
const { startScheduledRideScheduler, stopScheduledRideScheduler } = require('./src/services/scheduledRide.service');
const { startRideExpiryScheduler, stopRideExpiryScheduler } = require('./src/services/rideExpiry.service');
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
    stopScheduledRideScheduler();
    stopRideExpiryScheduler();
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

    /**
     * One-shot, non-fatal, idempotent data repair: free coupons held by rides stuck in
     * `searching` past PENDING_RIDE_MAX_AGE_MIN. There is no scheduler in this codebase,
     * so this runs once per boot; if a recurring sweep is ever wanted, call the same
     * exported function from a cron/maintenance job (it is safe to run repeatedly).
     */
    void releaseStaleCouponReservations()
        .then(({ staleRides, released }) => {
            if (released > 0) {
                console.log(`[coupon] released ${released} stale reservation(s) from ${staleRides} stale searching ride(s)`);
            }
        })
        .catch((err) => {
            console.warn('[coupon] stale reservation sweep skipped:', err?.message || err);
        });

    /**
     * Scheduled-ride dispatcher: flips `scheduled` rides to `searching` once their
     * `dispatchAt` passes and reuses the normal driver matching. DB-driven, so it
     * recovers rides whose dispatch time elapsed while the process was down.
     */
    startScheduledRideScheduler();

    /**
     * Search auto-expiry: a ride left `searching` past the search window is expired
     * (`cancelledBy: 'system'`) so it is NOT listed in Ride History, unlike a manual
     * passenger cancel (`cancelledBy: 'user'`). Atomic + idempotent, DB-driven.
     */
    startRideExpiryScheduler();
}

start();
