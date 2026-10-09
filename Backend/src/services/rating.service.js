const Rating = require('../models/rating.model');
const Ride = require('../models/rideCore.model');

function duplicateError() {
    const err = new Error('This ride has already been rated for this role');
    err.statusCode = 409;
    return err;
}

/**
 * Records one rating row per ride/role.
 *
 * For USER ratings, driver and ride information is automatically
 * copied from the completed ride so the rating remains a snapshot
 * even if the driver's profile changes later.
 */
async function recordRating({
    rideId,
    fromUserId,
    toUserId = null,
    fromRole,
    rating,
    comment = '',
    tags = []
}) {
    const existing = await Rating.findOne({
        rideId,
        fromRole
    }).lean();

    if (existing) {
        throw duplicateError();
    }

    // Get the ride and current captain information.
    const ride = await Ride.findById(rideId)
        .populate(
            'captain',
            'name phone vehicleType vehicleNumber'
        )
        .lean();

    if (!ride) {
        const err = new Error('Ride not found');
        err.statusCode = 404;
        throw err;
    }

    const captain = ride.captain || null;

    // Ride stores GeoJSON coordinates as [lng, lat].
    const pickupCoordinates = ride.pickup?.coordinates || [];
    const dropCoordinates = ride.drop?.coordinates || [];

    const pickupLongitude = Number.isFinite(Number(pickupCoordinates[0]))
        ? Number(pickupCoordinates[0])
        : null;

    const pickupLatitude = Number.isFinite(Number(pickupCoordinates[1]))
        ? Number(pickupCoordinates[1])
        : null;

    const dropLongitude = Number.isFinite(Number(dropCoordinates[0]))
        ? Number(dropCoordinates[0])
        : null;

    const dropLatitude = Number.isFinite(Number(dropCoordinates[1]))
        ? Number(dropCoordinates[1])
        : null;

    try {
        return await Rating.create({
            rideId,
            fromUserId,
            toUserId,
            fromRole,

            driverName: captain?.name || '',
            driverPhone: captain?.phone || '',
            vehicleType: captain?.vehicleType || ride.vehicleType || '',
            vehicleNumber: captain?.vehicleNumber || '',

            pickupLocation: {
                address: ride.pickupLocation || '',
                latitude: pickupLatitude,
                longitude: pickupLongitude
            },

            dropLocation: {
                address: ride.dropLocation || '',
                latitude: dropLatitude,
                longitude: dropLongitude
            },

            rating: Number(rating),
            comment: comment || '',
            tags: Array.isArray(tags) ? tags : []
        });

    } catch (err) {
        if (err?.code === 11000) {
            throw duplicateError();
        }

        throw err;
    }
}

async function listRatingsForUser(toUserId, { limit = 50 } = {}) {
    return Rating.find({
        toUserId
    })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
}

module.exports = {
    recordRating,
    listRatingsForUser
};
