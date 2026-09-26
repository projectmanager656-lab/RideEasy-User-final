const mongoose = require('mongoose');

/**
 * Canonical rating rows for the `ratings` collection.
 * One row per ride per role:
 * passenger→captain (USER) and captain→passenger (CAPTAIN).
 */
const ratingSchema = new mongoose.Schema({
    rideId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ride',
        required: true,
        index: true
    },

    fromUserId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },

    toUserId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
        index: true
    },

    fromRole: {
        type: String,
        enum: ['USER', 'CAPTAIN'],
        required: true,
        index: true
    },

    // Driver snapshot at the time of rating
    driverName: {
        type: String,
        default: ''
    },

    driverPhone: {
        type: String,
        default: ''
    },

    vehicleType: {
        type: String,
        default: ''
    },

    vehicleNumber: {
        type: String,
        default: ''
    },

    // Ride pickup snapshot
    pickupLocation: {
        address: {
            type: String,
            default: ''
        },
        latitude: {
            type: Number,
            default: null
        },
        longitude: {
            type: Number,
            default: null
        }
    },

    // Ride drop snapshot
    dropLocation: {
        address: {
            type: String,
            default: ''
        },
        latitude: {
            type: Number,
            default: null
        },
        longitude: {
            type: Number,
            default: null
        }
    },

    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },

    comment: {
        type: String,
        default: '',
        maxlength: 500
    },

    tags: {
        type: [String],
        default: []
    }

}, {
    timestamps: true,
    collection: 'ratings'
});

/** Prevent duplicate rating for the same ride/role. */
ratingSchema.index(
    { rideId: 1, fromRole: 1 },
    { unique: true }
);

/** Rating history for a target user. */
ratingSchema.index({
    toUserId: 1,
    createdAt: -1
});

module.exports = mongoose.model('Rating', ratingSchema);
