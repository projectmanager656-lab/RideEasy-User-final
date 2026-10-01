/**
 * Notifications: Mongo persistence + Socket.IO + Push (FCM/APNs) + SMS.
 *
 * Delivery is per-channel tracked on the notification doc (`delivery`), never
 * blocks or fails the calling ride/admin flow, and duplicate events are
 * collapsed via `dedupeKey` (`${rideId}_${TYPE}`-style) so the same event can
 * never send twice.
 */
const Notification = require('../models/notification.model');
const DeviceToken = require('../models/deviceToken.model');
const userModel = require('../models/user.model');
const logger = require('../utils/logger');
const smsService = require('./sms.service');

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

/** Socket event the passenger app listens on for new in-app notifications. */
const NOTIFICATION_EVENT = 'notification:new';

/** Plain, client-safe notification shape (never leaks another receiver's data). */
function publicNotificationPayload (notif) {
    if (!notif) return null;
    const o = notif.toObject ? notif.toObject() : { ...notif };
    return {
        _id: o._id,
        title: o.title,
        message: o.message,
        type: o.type,
        meta: o.meta || null,
        isRead: Boolean(o.isRead),
        createdAt: o.createdAt,
    };
}

// ---------------------------------------------------------------------------
// Push (FCM / APNs via firebase-admin). Real sends activate when the backend
// has `firebase-admin` installed AND one of:
//   FIREBASE_SERVICE_ACCOUNT_JSON   (raw service-account JSON in env)
//   GOOGLE_APPLICATION_CREDENTIALS  (path to a service-account file)
// Without them, push is recorded as `{ sent: false, error: 'push_not_configured' }`.
// ---------------------------------------------------------------------------
let fcmApp = null;
let fcmReady = false;

function getFcmMessaging () {
    if (fcmReady) return fcmApp;
    fcmReady = true;
    try {
        const admin = require('firebase-admin');
        if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            const creds = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
            fcmApp = admin.apps?.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(creds) });
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            fcmApp = admin.apps?.length ? admin.app() : admin.initializeApp();
        }
    } catch (e) {
        // firebase-admin not installed or bad credentials — stay in log-only mode.
        if (e?.code !== 'MODULE_NOT_FOUND') {
            logger.warn('notification.push init failed', { message: e?.message });
        }
        fcmApp = null;
    }
    return fcmApp;
}

/** Send push to all active devices of the receiver. Resolves a status object — never rejects. */
async function sendPushNotification ({ receiverId, receiverType, title, message, meta }) {
    if (!receiverId) return { sent: false, error: 'push_no_receiver' };
    const query = {
        active: true,
        ...(receiverType === 'captain' ? { captainId: receiverId } : { userId: receiverId }),
    };
    let tokens = [];
    try {
        tokens = await DeviceToken.find(query).lean();
    } catch (e) {
        return { sent: false, error: `push_token_lookup_failed: ${e?.message}` };
    }
    if (!tokens.length) return { sent: false, error: 'push_no_devices' };

    const messaging = getFcmMessaging();
    if (!messaging) {
        logger.info('[push notification] (no FCM configured — log only)', {
            receiverId: String(receiverId),
            receiverType,
            title,
            tokenCount: tokens.length,
        });
        return { sent: false, error: 'push_not_configured' };
    }

    const results = await Promise.allSettled(tokens.map(async (t) => {
        const res = await messaging.send({
            token: t.token,
            notification: { title: String(title || '').slice(0, 200), body: String(message || '').slice(0, 500) },
            ...(meta?.rideId ? { data: { rideId: String(meta.rideId), type: String(meta.notificationType || '') } } : {}),
            android: { priority: 'high' },
            apns: { payload: { aps: { sound: 'default' } } },
        });
        return res;
    }));
    const sentCount = results.filter((r) => r.status === 'fulfilled').length;
    const firstError = results.find((r) => r.status === 'rejected')?.reason?.message;

    // Deactivate tokens FCM reports as invalid so retries stop hitting them.
    const invalidTokens = [];
    results.forEach((r, i) => {
        if (r.status === 'rejected' && /not-registered|invalid-registration|unregistered/i.test(String(r.reason?.message))) {
            invalidTokens.push(tokens[i].token);
        }
    });
    if (invalidTokens.length) {
        void DeviceToken.updateMany({ token: { $in: invalidTokens } }, { $set: { active: false } }).catch(() => {});
    }

    if (sentCount === 0) {
        return { sent: false, error: String(firstError || 'push_send_failed').slice(0, 200) };
    }
    return { sent: true, error: sentCount < tokens.length ? String(firstError || 'partial').slice(0, 200) : null };
}

/** Send SMS for a user receiver (looks up the stored phone). Never rejects. */
async function sendSmsForNotification ({ receiverId, receiverType, message }) {
    if (receiverType !== 'user') return { sent: false, error: 'sms_user_only' };
    try {
        const user = await userModel.findById(receiverId).select('phone').lean();
        if (!user?.phone) return { sent: false, error: 'sms_no_phone' };
        return smsService.sendSms({ phone: user.phone, message });
    } catch (e) {
        return { sent: false, error: `sms_lookup_failed: ${e?.message}` };
    }
}

/**
 * Create + persist + fan out on the requested channels.
 * Returns the created notification (or null on persistence failure).
 */
async function createPersisted ({
    receiverId,
    receiverType,
    title,
    message,
    type = 'system',
    meta,
    dedupeKey = null,
    channels = { inApp: true, push: true, sms: false },
}) {
    try {
        /**
         * A ride reference must always be the authoritative Ride `_id`. A malformed
         * value is dropped instead of persisted — a stored dangling id is exactly what
         * makes a notification click resolve to `GET /rides/:id → 404` later.
         */
        let safeMeta = meta;
        if (meta && typeof meta === 'object' && meta.rideId != null) {
            const rideRef = String(meta.rideId);
            if (/^[a-f0-9]{24}$/i.test(rideRef)) {
                safeMeta = { ...meta, rideId: rideRef };
            } else {
                logger.warn('notification.invalidRideId', { type, rideId: rideRef });
                safeMeta = { ...meta };
                delete safeMeta.rideId;
            }
        }

        const notif = await Notification.create({
            receiverId,
            receiverType,
            title,
            message,
            type,
            meta: safeMeta,
            dedupeKey,
            isRead: false,
        });

        // Per-channel fan-out — every failure is recorded, none propagates.
        const delivery = {
            inApp: { sent: false },
            push: { sent: false, error: null },
            sms: { sent: false, error: null },
        };

        if (channels?.inApp !== false && receiverType === 'user' && receiverId) {
            emitToUser(receiverId, NOTIFICATION_EVENT, publicNotificationPayload(notif));
            delivery.inApp.sent = true;
        }

        if (channels?.push) {
            const push = await sendPushNotification({
                receiverId,
                receiverType,
                title,
                message,
                meta: { ...(safeMeta || {}), notificationType: type },
            });
            delivery.push.sent = Boolean(push.sent);
            delivery.push.error = push.error || null;
        }

        if (channels?.sms) {
            const sms = await sendSmsForNotification({ receiverId, receiverType, message });
            delivery.sms.sent = Boolean(sms.sent);
            delivery.sms.error = sms.error || null;
        }

        void Notification.updateOne({ _id: notif._id }, { delivery }).catch(() => {});
        notif.delivery = delivery;
        return notif;
    } catch (e) {
        // Duplicate-key on dedupeKey = the same event already processed — treat as success (no re-send).
        if (e?.code === 11000 && e?.keyPattern?.dedupeKey) {
            logger.info('notification.dedupe.hit', { dedupeKey });
            return null;
        }
        logger.warn('notification.persist failed', { message: e?.message });
        return null;
    }
}

/**
 * Idempotent create: checks the dedupe key BEFORE doing any work so repeated
 * ride-arrived / scheduled-dispatch events never send duplicate SMS or push.
 */
async function createIdempotent (params) {
    if (!params?.dedupeKey) return createPersisted(params);
    const existing = await Notification.findOne({ dedupeKey: params.dedupeKey }).lean();
    if (existing) {
        logger.info('notification.dedupe.existing', { dedupeKey: params.dedupeKey });
        return null;
    }
    return createPersisted(params);
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

module.exports = {
    emitToUser,
    emitToCaptain,
    NOTIFICATION_EVENT,
    publicNotificationPayload,
    createPersisted,
    createIdempotent,
    notifyRidePersist,
    listForReceiver,
    markRead,
    registerDeviceToken,
    removeDeviceToken,
    sendPushNotification,
};
