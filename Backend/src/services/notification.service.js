/**
 * Socket emits + optional Mongo persistence for audit / in-app inbox.
 */
const Notification = require('../models/notification.model');
const logger = require('../utils/logger');

function getSocketModule () {
    try {
        return require('../socket');
    } catch {
        return null;
    }
}

function emitToUser (userId, event, payload, options) {
    const m = getSocketModule();
    if (m?.emitToUser) m.emitToUser(userId, event, payload, options);
}

function emitToCaptain (captainId, event, payload) {
    const m = getSocketModule();
    if (m?.emitToCaptain) m.emitToCaptain(captainId, event, payload);
}

async function createPersisted ({
    receiverId,
    receiverType,
    title,
    message,
    type = 'system',
    meta,
}) {
    try {
        return await Notification.create({
            receiverId,
            receiverType,
            title,
            message,
            type,
            meta,
            isRead: false,
        });
    } catch (e) {
        logger.warn('notification.persist failed', { message: e?.message });
        return null;
    }
}

/** Ride lifecycle helper — persists + legacy socket (callers still emit separately during migration). */
async function notifyRidePersist (receiverId, receiverType, title, message, meta) {
    return createPersisted({
        receiverId,
        receiverType,
        title,
        message,
        type: 'ride',
        meta,
    });
}

async function listForReceiver (receiverId, receiverType, { limit = 40 } = {}) {
    return Notification.find({ receiverId, receiverType })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
}

async function markRead (id, receiverId) {
    return Notification.findOneAndUpdate(
        { _id: id, receiverId },
        { isRead: true },
        { new: true },
    );
}

module.exports = {
    emitToUser,
    emitToCaptain,
    createPersisted,
    notifyRidePersist,
    listForReceiver,
    markRead,
};
