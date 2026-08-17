const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
    {
        // Ride associated with this review.
        rideId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ride',
            required: true,
            index: true,
        },

        // User who submitted the review.
        fromUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'user',
            required: true,
            index: true,
        },

        // Person being reviewed.
        // In the normal customer-review flow this will be the driver.
        toUserId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },

        // Rating from 1 to 5.
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        },

        // Optional written feedback.
        comment: {
            type: String,
            maxlength: 500,
            default: '',
            trim: true,
        },
    },
    {
        timestamps: true,
        collection: 'reviews',
    }
);

// PDF-required index:
// reviews -> toUserId: 1, createdAt: -1
reviewSchema.index(
    { toUserId: 1, createdAt: -1 },
    { name: 'toUserId_1_createdAt_-1_pdf' }
);

// One review per user for a particular ride.
reviewSchema.index(
    { rideId: 1, fromUserId: 1 },
    {
        unique: true,
        name: 'rideId_1_fromUserId_1_unique',
    }
);

module.exports = mongoose.model('Review', reviewSchema);