const mongoose = require('mongoose');

const recentSearchSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true, index: true },
    pickup: { type: String, required: true },
    destination: { type: String, required: true },
    pickupCoords: {
        lat: { type: Number },
        lng: { type: Number },
    },
    dropCoords: {
        lat: { type: Number },
        lng: { type: Number },
    },
    detail: { type: String, default: '' },
}, { timestamps: true, collection: 'recent_searches' });

recentSearchSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('RecentSearch', recentSearchSchema);
