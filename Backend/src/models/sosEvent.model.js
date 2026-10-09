const mongoose = require('mongoose');

const sosEventSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true, index: true },
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'ride', default: null, index: true },
    captainId: { type: mongoose.Schema.Types.ObjectId, ref: 'captain', default: null, index: true },
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },
    status: {
        type: String,
        enum: ['triggered', 'acknowledged', 'resolved', 'false_alarm'],
        default: 'triggered',
        index: true,
    },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'admin', default: null },
    resolutionNotes: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
}, { timestamps: true, collection: 'sos_events' });

sosEventSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SosEvent', sosEventSchema);
