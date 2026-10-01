/**
 * Durable tracking of ride-offer dispatch attempts, one row per (ride, captain) in
 * `ride_dispatches`. This is observability + recovery metadata — it NEVER targets a
 * socket. Live delivery is still decided by the Socket.IO adapter room in
 * `emitToCaptain()`; these helpers only record what that attempt did.
 *
 * Every helper is safe to call fire-and-forget: dispatch must never fail (or slow
 * down ride creation) because the tracking write had a problem.
 */
const RideDispatch = require('../models/rideDispatch.model');
const logger = require('../utils/logger');

function toObjectId(value) {
    return value == null ? null : value;
}
/**
 * Record the outcome of one dispatch attempt for a matched captain.
 * `socketIds` is the LIVE room membership read at dispatch time — its length is the
 * only honest signal that the offer left the server towards a connected driver.
 */
async function recordDispatchAttempt({ rideId, captainId, roomName, socketIds = [] }) {
    const now = new Date();
    const delivered = socketIds.length > 0;
    return RideDispatch.findOneAndUpdate(
        { rideId: toObjectId(rideId), captainId: toObjectId(captainId) },
        {
            $set: {
                status: delivered ? 'delivered' : 'failed',
                socketRoom: roomName || null,
                socketIdAtDispatch: delivered ? socketIds[0] : null,
                socketConnected: delivered,
                socketDelivered: delivered,
                dispatchAttemptedAt: now,
                ...(delivered
                    ? { deliveredAt: now, failureReason: null }
                    : { deliveredAt: null, failureReason: 'NO_LIVE_DRIVER_SOCKET' }),
            },
            /** Preserved across re-dispatches of the same (ride, captain). */
            $setOnInsert: { matchedAt: now },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );
}

/** The matched driver's app confirmed receipt of the offer (existing `rideRequest:ack`). */
async function markDispatchAcknowledged({ rideId, captainId, socketId }) {
    return RideDispatch.findOneAndUpdate(
        { rideId: toObjectId(rideId), captainId: toObjectId(captainId) },
        {
            $set: {
                status: 'acknowledged',
                driverAcknowledged: true,
                acknowledgedAt: new Date(),
                socketConnected: true,
                socketDelivered: true,
                ...(socketId ? { socketIdAtDispatch: socketId } : {}),
            },
            $setOnInsert: { matchedAt: new Date() },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );
}

/** Terminal ride-level outcome for every dispatch attempt of a ride. */
async function markRideDispatchesStatus(rideId, status) {
    return RideDispatch.updateMany(
        { rideId: toObjectId(rideId) },
        { $set: { status } },
    );
}

/** Fire-and-forget wrappers — a tracking failure is logged, never thrown. */
function recordDispatchAttemptSafe(args) {
    void recordDispatchAttempt(args).catch((err) => {
        logger.warn('rideDispatch.record failed', {
            rideId: String(args?.rideId ?? ''),
            captainId: String(args?.captainId ?? ''),
            message: err?.message,
        });
    });
}

function markDispatchAcknowledgedSafe(args) {
    void markDispatchAcknowledged(args).catch((err) => {
        logger.warn('rideDispatch.ack failed', {
            rideId: String(args?.rideId ?? ''),
            captainId: String(args?.captainId ?? ''),
            message: err?.message,
        });
    });
}

function markRideDispatchesStatusSafe(rideId, status) {
    void markRideDispatchesStatus(rideId, status).catch((err) => {
        logger.warn('rideDispatch.status failed', {
            rideId: String(rideId ?? ''),
            status,
            message: err?.message,
        });
    });
}

module.exports = {
    recordDispatchAttempt,
    recordDispatchAttemptSafe,
    markDispatchAcknowledged,
    markDispatchAcknowledgedSafe,
    markRideDispatchesStatus,
    markRideDispatchesStatusSafe,
};
