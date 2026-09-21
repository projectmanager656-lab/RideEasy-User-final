/**
 * Socket emits + Mongo persistence + Push notification tokens.
 */
const Notification = require('../models/notification.model');
const DeviceToken = require('../models/deviceToken.model');
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
        const notif = await Notification.create({
            receiverId,
            receiverType,
            title,
            message,
            type,
            meta,
            isRead: false,
        });
        // Dispatch push notification to registered device tokens
        void sendPushNotification({ receiverId, receiverType, title, message, meta }).catch(() => {});
        return notif;
    } catch (e) {
        logger.warn('notification.persist failed', { message: e?.message });
        return null;
    }
}

/** Ride lifecycle helper — persists + socket. */
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

/** Register/update device push token */
async function registerDeviceToken({ userId, captainId, role, token, platform = 'android', appVersion = null }) {
    if (!token) return null;
    return DeviceToken.findOneAndUpdate(
        { token },
        {
            $set: {
                userId: userId || null,
                captainId: captainId || null,
                role,
                platform,
                appVersion,
                active: true,
                lastSeenAt: new Date(),
            },
        },
        { upsert: true, new: true },
    );
}

async function removeDeviceToken(token) {
    if (!token) return null;
    return DeviceToken.findOneAndDelete({ token });
}

async function sendPushNotification({ receiverId, receiverType, title, message, meta }) {
    if (!receiverId) return;
    const query = {
        active: true,
        ...(receiverType === 'captain' ? { captainId: receiverId } : { userId: receiverId }),
    };
    const tokens = await DeviceToken.find(query).lean();
    if (!tokens.length) return;
    
    // In production, FCM/APNS would be called here. We log securely without printing tokens.
    logger.info('[push notification]', {
        receiverId: String(receiverId),
        receiverType,
        title,
        tokenCount: tokens.length,
    });
}

module.exports = {
    emitToUser,
    emitToCaptain,
    createPersisted,
    notifyRidePersist,
    listForReceiver,
    markRead,
    registerDeviceToken,
    removeDeviceToken,
    sendPushNotification,
};
