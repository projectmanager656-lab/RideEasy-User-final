const rideModel = require('../models/rideCore.model');

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

            if (!ride) return;

            const pr = publicRideForSocket(ride);

            socket.emit('ride:status-update', {
                rideId: ride._id,
                status: ride.status,
                ride: pr,
                catchUp: true,
            });
        }
    } catch (e) {
        console.warn('[socket join catch-up]', e?.message || e);
    }
}

module.exports = { emitJoinCatchUp };
