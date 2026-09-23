/**
 * Scheduled-ride dispatcher.
 *
 * MongoDB is the source of truth: every tick looks for rides that are still
 * `scheduled` with a due `dispatchAt`. Nothing is kept in memory, so rides
 * survive a backend restart or downtime — an overdue ride is simply claimed on
 * the first tick after boot.
 *
 * The transition `scheduled -> searching` is a single atomic
 * `findOneAndUpdate` guarded by `status: 'scheduled'`, so repeated ticks,
 * overlapping runs or multiple instances can never dispatch the same ride twice.
 *
 * Once a ride is `searching` this module hands off to the SAME matching routine
 * Book Now uses (`ride.controller.startRideDispatch`) — there is no second
 * dispatch implementation and no separate ride lifecycle.
 */
const { ensureDbConnected } = require('../config/db');
const rideModel = require('../models/rideCore.model');
const logger = require('../utils/logger');
const { emitToUser } = require('../socket');
const { notifyRidePersist } = require('./notification.service');

/** Upper bound on rides handled per tick so one burst cannot stall the loop. */
const BATCH_SIZE = 25;

function schedulerIntervalMs() {
    const raw = Number(process.env.SCHEDULED_RIDE_SCHEDULER_INTERVAL_MS);
    if (Number.isFinite(raw) && raw >= 1000) return Math.min(Math.floor(raw), 10 * 60 * 1000);
    return 30 * 1000;
}

/** Lazy require — keeps the large controller module out of the boot-time graph. */
function getDispatchFn() {
    return require('../controllers/ride.controller').startRideDispatch;
}

/** Strip OTP material before anything ride-shaped goes out on a socket. */
function publicRideForSocket(ride) {
    if (!ride) return null;
    const o = ride.toObject ? ride.toObject({ virtuals: true }) : { ...ride };
    delete o.otpHash;
    delete o.otpCipher;
    delete o.otp;
    return o;
}

/**
 * Atomically claim the next due scheduled ride.
 * Only ONE caller can win for a given ride because the filter pins `status`.
 */
async function claimNextDueScheduledRide() {
    const now = new Date();
    return rideModel
        .findOneAndUpdate(
            { status: 'scheduled', dispatchAt: { $ne: null, $lte: now } },
            { $set: { status: 'searching', searchStartedAt: now } },
            { new: true, sort: { dispatchAt: 1 } },
        )
        .populate('user', 'name phone email');
}

/** Persisted notification + push hook (reuses the existing notification service). */
async function notifyPassengerScheduledDispatch(ride) {
    const userId = ride.user?._id || ride.user;
    if (!userId) return;
    await notifyRidePersist(
        userId,
        'user',
        'Your scheduled ride is starting',
        "We're now searching for a driver for your scheduled RideEasy trip.",
        { rideId: String(ride._id), rideStatus: 'searching', source: 'scheduled_dispatch' },
    );
}

/**
 * Dispatch every scheduled ride whose `dispatchAt` has passed.
 * Safe to call repeatedly and concurrently — claims are atomic.
 */
async function dispatchDueScheduledRides() {
    await ensureDbConnected();
    const dispatched = [];

    for (let i = 0; i < BATCH_SIZE; i += 1) {
        let ride;
        try {
            ride = await claimNextDueScheduledRide();
        } catch (err) {
            logger.warn('scheduledRide.claim failed', { message: err?.message });
            break;
        }
        if (!ride) break;

        const rideId = ride._id;
        const userId = ride.user?._id || ride.user;

        console.log(
            '[scheduled rides] dispatching ride=%s user=%s scheduledPickupAt=%s',
            String(rideId),
            userId ? String(userId) : 'none',
            ride.scheduledPickupAt ? new Date(ride.scheduledPickupAt).toISOString() : '',
        );

        /* 1. Tell an open app immediately, in realtime. */
        if (userId) {
            emitToUser(userId, 'ride:status-update', {
                rideId,
                status: 'searching',
                dispatchedFrom: 'scheduled',
                scheduledPickupAt: ride.scheduledPickupAt,
                ride: publicRideForSocket(ride),
            });
        }

        /* 2. Persisted notification + push hook. Raised right after the claim so an
              app that is closed/backgrounded is signalled without waiting on matching. */
        try {
            await notifyPassengerScheduledDispatch(ride);
        } catch (err) {
            logger.warn('scheduledRide.notify failed', {
                rideId: String(rideId),
                message: err?.message,
            });
        }

        /* 3. Reuse the existing driver matching (identical to Book Now). */
        try {
            await getDispatchFn()(rideId);
        } catch (err) {
            logger.warn('scheduledRide.match failed', {
                rideId: String(rideId),
                message: err?.message,
            });
        }

        dispatched.push({ rideId: String(rideId), userId: userId ? String(userId) : null });
    }

    return { dispatched: dispatched.length, rides: dispatched };
}

let schedulerTimer = null;
let tickRunning = false;

async function runScheduledRideTick() {
    /** Never overlap ticks — one slow pass must not stack up. */
    if (tickRunning) return { skipped: 'already_running' };
    tickRunning = true;
    try {
        const result = await dispatchDueScheduledRides();
        if (result.dispatched > 0) {
            console.log(`[scheduled rides] dispatched ${result.dispatched} ride(s)`);
        }
        return result;
    } catch (err) {
        logger.warn('scheduledRide.tick failed', { message: err?.message });
        return { dispatched: 0, error: err?.message };
    } finally {
        tickRunning = false;
    }
}

/**
 * Start the periodic dispatcher. It is intentionally lightweight and in-process
 * (this backend has no external job runner), and it is fully DB-driven so a
 * restart or downtime cannot lose a scheduled ride.
 */
function startScheduledRideScheduler() {
    const ms = schedulerIntervalMs();
    console.log(`[scheduled rides] dispatcher started (interval ${ms}ms)`);
    /* Immediate pass: picks up rides whose dispatch time passed while the server was down. */
    void runScheduledRideTick();
    if (schedulerTimer) clearInterval(schedulerTimer);
    schedulerTimer = setInterval(() => {
        void runScheduledRideTick();
    }, ms);
    if (typeof schedulerTimer.unref === 'function') schedulerTimer.unref();
    return schedulerTimer;
}

function stopScheduledRideScheduler() {
    if (schedulerTimer) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
    }
}

module.exports = {
    startScheduledRideScheduler,
    stopScheduledRideScheduler,
    dispatchDueScheduledRides,
    runScheduledRideTick,
    claimNextDueScheduledRide,
    schedulerIntervalMs,
};
