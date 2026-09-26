/**
 * Automatic expiry of stale driver searches.
 *
 * A ride left in `searching` past the passenger search window was never accepted,
 * so the backend expires it. This is DISTINCT from a passenger cancelling:
 *
 *   manual cancel  -> `cancelledBy: 'user'`    (stays visible in Ride History)
 *   auto expiry    -> `cancelledBy: 'system'`  (excluded from Ride History)
 *
 * The project's existing Ride fields carry the distinction — `cancelledBy`
 * already enumerates `user | captain | system` — so no redundant field is added.
 * The detailed reason is recorded in the existing `cancellationReason`.
 *
 * The transition is a single atomic `findOneAndUpdate` guarded by
 * `status: 'searching'` + `captain: null`, so repeated ticks, overlapping runs or
 * multiple instances can never expire the same ride twice, and a ride a driver
 * just accepted is never clobbered. Rides are only marked — never deleted.
 */
const { ensureDbConnected } = require('../config/db');
const rideModel = require('../models/rideCore.model');
const logger = require('../utils/logger');
const { emitToUser } = require('../socket');
const { releaseCoupon } = require('./coupon.service');
const rideService = require('./rideCore.service');
const { markRideDispatchesStatusSafe } = require('./rideDispatch.service');

/** Same window the passenger app shows "No Driver Found" after. */
const DEFAULT_SEARCH_WINDOW_SEC = 120;
/** Upper bound on rides handled per tick so one burst cannot stall the loop. */
const BATCH_SIZE = 50;

function searchWindowSec() {
    const raw = Number(process.env.RIDE_SEARCH_WINDOW_SEC);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_SEARCH_WINDOW_SEC;
}

function expiryIntervalMs() {
    const raw = Number(process.env.RIDE_EXPIRY_SCHEDULER_INTERVAL_MS);
    if (Number.isFinite(raw) && raw >= 1000) return Math.min(Math.floor(raw), 10 * 60 * 1000);
    return 30 * 1000;
}

/** Strip OTP material before anything ride-shaped goes out on a socket. */
function publicRideForSocket(ride) {
    if (!ride) return null;
    const o = ride.toObject ? ride.toObject({ virtuals: true }) : { ...ride };
    delete o.otpHash;
    delete o.otpCipher;
    delete o.otp;
    delete o.offerAcks;
    return o;
}

/**
 * Expire every `searching` ride whose search window has passed.
 * Safe to call repeatedly and concurrently — each claim is atomic.
 */
async function expireStaleSearchingRides() {
    await ensureDbConnected();
    const windowSec = searchWindowSec();
    const cutoff = new Date(Date.now() - windowSec * 1000);

    /**
     * Recency is measured from when SEARCH began, not when the row was created:
     * `searchStartedAt` is set at creation for Book Now and at dispatch for a
     * scheduled ride, so a future scheduled booking is never expired early.
     * Legacy rows without it fall back to `createdAt`.
     * Only `searching` is swept — `scheduled` rides are left untouched.
     */
    const stale = await rideModel
        .find({
            status: 'searching',
            $or: [
                { searchStartedAt: { $ne: null, $lte: cutoff } },
                { searchStartedAt: { $in: [ null, undefined ] }, createdAt: { $lte: cutoff } },
            ],
        })
        .select('_id user captain')
        .limit(BATCH_SIZE)
        .lean();

    let expired = 0;
    for (const row of stale) {
        let claimed;
        try {
            claimed = await rideModel.findOneAndUpdate(
                { _id: row._id, status: 'searching', captain: null },
                {
                    $set: {
                        status: 'cancelled',
                        cancelledBy: 'system',
                        cancellationReason: 'auto_expired',
                        cancellationFee: 0,
                        cancelledAt: new Date(),
                    },
                },
                { new: true },
            );
        } catch (err) {
            logger.warn('rideExpiry.claim failed', { rideId: String(row._id), message: err?.message });
            continue;
        }
        /* Lost the race (accepted / already cancelled) — nothing to do. */
        if (!claimed) continue;

        expired += 1;

        /* Existing cancellation cleanup: free any coupon reserved for the ride. */
        try {
            await releaseCoupon({ rideId: claimed._id });
        } catch (err) {
            logger.warn('rideExpiry.couponRelease failed', {
                rideId: String(claimed._id),
                message: err?.message,
            });
        }
        try {
            await rideService.releaseCaptainBusyIfAvailable(claimed.captain);
        } catch (err) {
            logger.warn('rideExpiry.releaseCaptain failed', {
                rideId: String(claimed._id),
                message: err?.message,
            });
        }

        /* Terminal outcome for every dispatch attempt of this ride. */
        markRideDispatchesStatusSafe(claimed._id, 'expired');

        /* Existing status event — passenger leaves the search screen on a final status. */
        const userId = claimed.user?._id || claimed.user;
        if (userId) {
            emitToUser(userId, 'ride:status-update', {
                rideId: claimed._id,
                status: 'cancelled',
                cancelledBy: 'system',
                terminationReason: 'auto_expired',
                reason: 'search_window_expired',
                ride: publicRideForSocket(claimed),
            });
        }

        console.log(
            '[ride expiry] auto-expired ride=%s (search window %ds, no driver accepted)',
            String(claimed._id),
            windowSec,
        );
    }

    return { scanned: stale.length, expired };
}

let expiryTimer = null;
let tickRunning = false;

async function runRideExpiryTick() {
    /** Never overlap ticks — one slow pass must not stack up. */
    if (tickRunning) return { skipped: 'already_running' };
    tickRunning = true;
    try {
        const result = await expireStaleSearchingRides();
        if (result.expired > 0) {
            console.log(`[ride expiry] expired ${result.expired} stale search(es)`);
        }
        return result;
    } catch (err) {
        logger.warn('rideExpiry.tick failed', { message: err?.message });
        return { expired: 0, error: err?.message };
    } finally {
        tickRunning = false;
    }
}

/**
 * Start the periodic expiry sweep. In-process and DB-driven (this backend has no
 * external job runner), so a restart or downtime cannot lose an expirable ride —
 * an overdue one is simply claimed on the first tick after boot.
 */
function startRideExpiryScheduler() {
    const ms = expiryIntervalMs();
    console.log(`[ride expiry] scheduler started (interval ${ms}ms, window ${searchWindowSec()}s)`);
    void runRideExpiryTick();
    if (expiryTimer) clearInterval(expiryTimer);
    expiryTimer = setInterval(() => {
        void runRideExpiryTick();
    }, ms);
    if (typeof expiryTimer.unref === 'function') expiryTimer.unref();
    return expiryTimer;
}

function stopRideExpiryScheduler() {
    if (expiryTimer) {
        clearInterval(expiryTimer);
        expiryTimer = null;
    }
}

module.exports = {
    startRideExpiryScheduler,
    stopRideExpiryScheduler,
    expireStaleSearchingRides,
    runRideExpiryTick,
    searchWindowSec,
    expiryIntervalMs,
};
