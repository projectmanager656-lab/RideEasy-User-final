const mongoose = require('mongoose');

const rideShareSchema = new mongoose.Schema({
    shareToken: { type: String, required: true, unique: true, index: true },
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'ride', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true, index: true },
    expiresAt: { type: Date, required: true },
    revoked: { type: Boolean, default: false },
}, { timestamps: true, collection: 'ride_shares' });

rideShareSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RideShare', rideShareSchema);
