const Rating = require('../models/rating.model');

function duplicateError() {
    const err = new Error('This ride has already been rated for this role');
    err.statusCode = 409;
    return err;
}

/** Records one rating row per ride/role; rejects duplicates. */
async function recordRating({ rideId, fromUserId, toUserId = null, fromRole, rating, comment = '', tags = [] }) {
    const existing = await Rating.findOne({ rideId, fromRole }).lean();
    if (existing) throw duplicateError();
    try {
        return await Rating.create({
            rideId,
            fromUserId,
            toUserId,
            fromRole,
            rating: Number(rating),
            comment: comment || '',
            tags: Array.isArray(tags) ? tags : [],
        });
    } catch (err) {
        if (err?.code === 11000) throw duplicateError();
        throw err;
    }
}

async function listRatingsForUser(toUserId, { limit = 50 } = {}) {
    return Rating.find({ toUserId }).sort({ createdAt: -1 }).limit(limit).lean();
}

module.exports = { recordRating, listRatingsForUser };
