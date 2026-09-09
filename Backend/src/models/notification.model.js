const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    receiverId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    receiverType: { type: String, enum: [ 'user', 'captain', 'admin' ], required: true, index: true },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 2000 },
    type: { type: String, enum: [ 'ride', 'payment', 'subscription', 'admin', 'system' ], default: 'system' },
    meta: { type: mongoose.Schema.Types.Mixed },
    isRead: { type: Boolean, default: false, index: true },
}, { timestamps: true, collection: 'notifications' });

notificationSchema.index({ receiverId: 1, receiverType: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
