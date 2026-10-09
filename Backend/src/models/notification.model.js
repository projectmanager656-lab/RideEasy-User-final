const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    receiverId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    receiverType: { type: String, enum: [ 'user', 'captain', 'admin' ], required: true, index: true },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 2000 },
    type: {
        type: String,
        enum: [
            'ride', 'payment', 'subscription', 'admin', 'system',
            'ride_arrived', 'new_feature', 'promotion', 'important_update', 'system_alert',
        ],
        default: 'system',
    },
    meta: { type: mongoose.Schema.Types.Mixed },
    isRead: { type: Boolean, default: false, index: true },
    /** Idempotency guard — `${rideId}_${TYPE}` style; one notification per event key. */
    dedupeKey: { type: String, default: null },
    /** Per-channel delivery tracking for debugging (never blocks the ride flow). */
    delivery: {
        inApp: { sent: { type: Boolean, default: false } },
        push: {
            sent: { type: Boolean, default: false },
            error: { type: String, default: null },
        },
        sms: {
            sent: { type: Boolean, default: false },
            error: { type: String, default: null },
        },
    },
}, { timestamps: true, collection: 'notifications' });

notificationSchema.index({ receiverId: 1, receiverType: 1, createdAt: -1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Notification', notificationSchema);
