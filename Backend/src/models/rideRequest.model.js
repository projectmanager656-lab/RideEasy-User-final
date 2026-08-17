const mongoose = require('mongoose');

const geoPointSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ['Point'],
            required: true,
            default: 'Point',
        },

        coordinates: {
            type: [Number],
            required: true,
            validate: {
                validator: function (value) {
                    return (
                        Array.isArray(value) &&
                        value.length === 2 &&
                        value.every(
                            (coordinate) =>
                                typeof coordinate === 'number' &&
                                Number.isFinite(coordinate)
                        )
                    );
                },
                message:
                    'coordinates must contain exactly [longitude, latitude] as numbers',
            },
        },
    },
    {
        _id: false,
    }
);

const rideRequestSchema = new mongoose.Schema(
    {
        // Customer who created the ride request.
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'user',
            required: true,
        },

        // Requested vehicle/service category.
        // Keep this aligned with the existing backend vehicle types.
        serviceType: {
            type: String,
            required: true,
            enum: ['BIKE', 'AUTO', 'CAR'],
        },

        // Customer pickup location.
        // GeoJSON coordinates are [longitude, latitude].
        pickup: {
            type: geoPointSchema,
            required: true,
        },

        // Customer destination.
        // GeoJSON coordinates are [longitude, latitude].
        dropoff: {
            type: geoPointSchema,
            required: true,
        },

        // Fare calculated by the backend before driver matching.
        estimatedFare: {
            type: Number,
            required: true,
            min: 0,
        },

        // Lifecycle of a short-lived ride request.
        status: {
            type: String,
            enum: ['searching', 'accepted', 'cancelled', 'expired'],
            default: 'searching',
            required: true,
        },

        // Optional expiry time for the short-lived request.
        // The database sync script already creates a TTL index
        // on this field with expireAfterSeconds: 0.
        expiresAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'rideRequests',
    }
);

// PDF requirement:
// rideRequests.pickup -> 2dsphere
rideRequestSchema.index({
    pickup: '2dsphere',
});

module.exports = mongoose.model('RideRequest', rideRequestSchema);