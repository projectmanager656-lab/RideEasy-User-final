const rideModel = require('../models/rideCore.model');
const captainModel = require('../models/captain.model');
const { RIDE_REQUEST } = require('./rideSocket.events');
const { ridePickupInServiceArea } = require('../utils/serviceArea');

/** Same age window the `/rides/pending` poll uses (see findPendingRidesForCaptain). */
const PENDING_RIDE_MAX_AGE_MIN = Number(process.env.PENDING_RIDE_MAX_AGE_MIN || 45);

function publicRideForSocket(ride) {
    if (!ride) return null;
    const o = ride.toObject ? ride.toObject({ virtuals: true }) : { ...ride };
    delete o.otpHash;
    delete o.otpCipher;
    delete o.otp;
    return o;
}

function driverLocationFromCaptainRef(captain) {
    if (!captain) return undefined;
    const co = captain.toObject ? captain.toObject({ virtuals: true }) : captain;
    const coords = co?.location?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return undefined;
    const [ lng, lat ] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    if (Math.abs(lat) < 1e-5 && Math.abs(lng) < 1e-5) return undefined;
    return { lat, lng };
}

/**
 * A driver can go online (or reconnect) AFTER a ride was dispatched, at which
 * point the original `rideRequest` frame is long gone and the room emit already
 * happened. Re-offer the newest searching ride this driver is eligible for,
 * using the SAME filters as `GET /rides/pending` (city + vehicle + age + not
 * declined + unassigned + pickup inside the service area), so the socket delivers
 * the offer immediately instead of waiting for the HTTP poll. No matching rule is
 * bypassed — this is the poll's eligibility, delivered over the socket.
 */
async function emitSearchingRideOffer(socket, captainId) {
    const cap = await captainModel
        .findById(captainId)
        .select('servingCity vehicleType')
        .lean();
    if (!cap?.servingCity || !cap?.vehicleType) return;

    const createdAfter = new Date(Date.now() - PENDING_RIDE_MAX_AGE_MIN * 60 * 1000);
    const rides = await rideModel
        .find({
            status: 'searching',
            city: cap.servingCity,
            vehicleType: cap.vehicleType,
            createdAt: { $gte: createdAfter },
            declinedBy: { $nin: [ captainId ] },
            $or: [ { captain: null }, { captain: { $exists: false } } ],
        })
        .sort({ createdAt: -1 })
        .limit(5);

    for (const ride of rides) {
        if (!ridePickupInServiceArea(ride)) continue;
        const rideIdStr = String(ride._id);
        /**
         * `join` and `join-driver` both land here for one connection, so offer a
         * given ride to a given socket at most once (10s window) — otherwise the
         * driver sees the same request pop twice.
         */
        const last = socket.data.catchUpOffer;
        const now = Date.now();
        if (last && last.rideId === rideIdStr && now - last.at < 10_000) return;
        socket.data.catchUpOffer = { rideId: rideIdStr, at: now };
        socket.emit(RIDE_REQUEST, {
            ride: publicRideForSocket(ride),
            offeredAt: now,
            catchUp: true,
        });
        return;
    }
}

/**
 * After (re)join, push current in-progress ride so clients recover without missing state.
 * Uses direct `socket.emit` so it reaches this connection even if room join races.
 */
async function emitJoinCatchUp(socket) {
    const role = socket.data.rideeasyRole;
    const uid = socket.data.rideeasyUserId;
    if (!role || !uid) return;

    try {
        if (role === 'user') {
            const ride = await rideModel
                .findOne({
                    user: uid,
                    status: { $in: [ 'searching', 'accepted', 'arrived', 'started' ] },
                })
                .populate('captain');

            if (!ride) return;

            const pr = publicRideForSocket(ride);
            const driverLocation = driverLocationFromCaptainRef(ride.captain);

            socket.emit('ride:status-update', {
                rideId: ride._id,
                status: ride.status,
                ride: pr,
                driverLocation,
                catchUp: true,
            });
            return;
        }

        if (role === 'captain') {
            const ride = await rideModel
                .findOne({
                    captain: uid,
                    status: { $in: [ 'accepted', 'arrived', 'started' ] },
                })
                .populate('user', 'name phone email');

            if (ride) {
                const pr = publicRideForSocket(ride);

                socket.emit('ride:status-update', {
                    rideId: ride._id,
                    status: ride.status,
                    ride: pr,
                    catchUp: true,
                });
                /* Already on a ride — never offer a second one. */
                return;
            }

            /* Free and online: re-offer any still-searching ride for this city/vehicle. */
            await emitSearchingRideOffer(socket, uid);
        }
    } catch (e) {
        console.warn('[socket join catch-up]', e?.message || e);
    }
}

module.exports = { emitJoinCatchUp };
