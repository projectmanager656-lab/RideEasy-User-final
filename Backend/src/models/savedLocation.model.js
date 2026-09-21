const mongoose = require('mongoose');

const savedLocationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true, index: true },
    type: {
        type: String,
        enum: ['home', 'work', 'favorite', 'other'],
        default: 'other',
    },
    label: { type: String, default: '' },
    address: { type: String, required: true },
    latitude: { type: Number },
    longitude: { type: Number },
}, { timestamps: true, collection: 'saved_locations' });

savedLocationSchema.index({ userId: 1, type: 1 });

module.exports = mongoose.model('SavedLocation', savedLocationSchema);
