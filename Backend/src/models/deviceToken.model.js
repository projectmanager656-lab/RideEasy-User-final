const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', default: null, sparse: true, index: true },
    captainId: { type: mongoose.Schema.Types.ObjectId, ref: 'captain', default: null, sparse: true, index: true },
    role: { type: String, enum: ['user', 'captain', 'admin'], required: true },
    token: { type: String, required: true, unique: true, index: true },
    platform: { type: String, enum: ['android', 'ios', 'web', 'unknown'], default: 'android' },
    appVersion: { type: String, default: null },
    active: { type: Boolean, default: true, index: true },
    lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true, collection: 'device_tokens' });

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);
