/**
 * Notification service — spans the master requirements: duplicate protection
 * (`dedupeKey`, insert-race), idempotent ride-arrived dispatch, per-channel
 * delivery tracking (in-app/push/SMS) and SMS failure isolation (a failed SMS
 * must never fail the ride flow).
 */

jest.mock('../../models/notification.model', () => ({
    create: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    updateOne: jest.fn(),
    deleteMany: jest.fn(),
}));
jest.mock('../../models/deviceToken.model', () => ({ find: jest.fn() }));
jest.mock('../../models/user.model', () => ({ findById: jest.fn() }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../services/sms.service', () => ({
    sendSms: jest.fn(),
    isConfigured: jest.fn(() => true),
}));
jest.mock('../../socket', () => ({ emitToUser: jest.fn(), emitToCaptain: jest.fn() }));

const Notification = require('../../models/notification.model');
const DeviceToken = require('../../models/deviceToken.model');
const userModel = require('../../models/user.model');
const socket = require('../../socket');
const smsService = require('../../services/sms.service');
const notificationService = require('../../services/notification.service');

function notifDoc () {
    return {
        _id: 'n1',
        title: 'Ride Arrived',
        message: 'Your RideEasy driver has arrived.',
        type: 'ride_arrived',
        isRead: false,
        meta: { rideId: 'ride1' },
        toObject: () => ({ _id: 'n1', title: 'Ride Arrived', message: 'Your RideEasy driver has arrived.', type: 'ride_arrived', isRead: false, meta: { rideId: 'ride1' }, createdAt: new Date() }),
    };
}

const params = () => ({
    receiverId: 'u1',
    receiverType: 'user',
    title: 'Ride Arrived',
    message: 'Your RideEasy driver has arrived.',
    type: 'ride_arrived',
    meta: { rideId: 'ride1' },
    dedupeKey: 'ride1_RIDE_ARRIVED',
    channels: { inApp: true, push: true, sms: true },
});

describe('notification service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Notification.updateOne.mockReturnValue({ catch: jest.fn().mockResolvedValue(undefined) });
    });

    test('createIdempotent skips send entirely when the dedupe key already exists', async () => {
        Notification.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'existing' }) });

        const out = await notificationService.createIdempotent(params());

        expect(out).toBeNull();
        expect(Notification.create).not.toHaveBeenCalled();
        expect(socket.emitToUser).not.toHaveBeenCalled();
        expect(smsService.sendSms).not.toHaveBeenCalled();
    });

    test('an insert-race duplicate (11000 on dedupeKey) is swallowed silent', async () => {
        Notification.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
        Notification.create.mockRejectedValue({ code: 11000, keyPattern: { dedupeKey: 1 } });

        const out = await notificationService.createIdempotent(params());

        expect(out).toBeNull();
        expect(socket.emitToUser).not.toHaveBeenCalled();
        expect(smsService.sendSms).not.toHaveBeenCalled();
    });

    test('createPersisted fans out every channel and records per-channel status', async () => {
        Notification.findOne.mockResolvedValue(null);
        Notification.create.mockResolvedValue(notifDoc());
        DeviceToken.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
        userModel.findById.mockReturnValue({
            select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'u1', phone: '+911234567890' }) }),
        });
        smsService.sendSms.mockResolvedValue({ sent: true });

        const notif = await notificationService.createPersisted(params());

        expect(notif).not.toBeNull();
        expect(socket.emitToUser).toHaveBeenCalledWith(
            'u1',
            'notification:new',
            expect.objectContaining({ title: 'Ride Arrived', type: 'ride_arrived' }),
            undefined,
        );
        expect(notif.delivery.inApp.sent).toBe(true);
        expect(notif.delivery.push.sent).toBe(false);
        expect(notif.delivery.push.error).toBe('push_no_devices');
        expect(notif.delivery.sms.sent).toBe(true);
        expect(notif.delivery.sms.error).toBeNull();
        expect(smsService.sendSms).toHaveBeenCalledWith({ phone: '+911234567890', message: 'Your RideEasy driver has arrived.' });
        expect(Notification.updateOne).toHaveBeenCalledWith({ _id: 'n1' }, { delivery: expect.objectContaining({ sms: { sent: true, error: null } }) });
    });

    test('push lookup failure is recorded and never propagates', async () => {
        Notification.findOne.mockResolvedValue(null);
        Notification.create.mockResolvedValue(notifDoc());
        DeviceToken.find.mockReturnValue({ lean: jest.fn().mockRejectedValue(new Error('db down')) });
        smsService.sendSms.mockResolvedValue({ sent: false, error: 'provider unavailable' });

        const notif = await notificationService.createPersisted(params());

        expect(notif.delivery.push.sent).toBe(false);
        expect(String(notif.delivery.push.error)).toContain('db down');
        expect(notif.delivery.sms.sent).toBe(false);
        expect(notif.delivery.sms.error).toBe('provider unavailable');
        expect(notif.delivery.inApp.sent).toBe(true);
    });

    test('SMS failure is recorded, the notification itself still succeeds', async () => {
        Notification.findOne.mockResolvedValue(null);
        Notification.create.mockResolvedValue(notifDoc());
        DeviceToken.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
        userModel.findById.mockImplementation(() => { throw new Error('user lookup blow-up'); });

        const notif = await notificationService.createPersisted(params());

        expect(notif).not.toBeNull();
        expect(notif.delivery.sms.sent).toBe(false);
        expect(String(notif.delivery.sms.error)).toContain('user lookup blow-up');
        expect(notif.delivery.inApp.sent).toBe(true);
    });

    test('createIdempotent without a dedupe key goes straight to create', async () => {
        Notification.create.mockResolvedValue(notifDoc());
        DeviceToken.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

        const { dedupeKey, ...noKey } = params();
        const out = await notificationService.createIdempotent(noKey);

        expect(Notification.findOne).not.toHaveBeenCalled();
        expect(Notification.create).toHaveBeenCalledTimes(1);
        expect(out).not.toBeNull();
    });

    test('createPersisted drops a malformed meta.rideId instead of persisting a dangling reference', async () => {
        Notification.create.mockResolvedValue(notifDoc());

        await notificationService.createPersisted({
            ...params(),
            meta: { rideId: 'not-an-object-id', rideStatus: 'arrived' },
            channels: { inApp: true },
        });

        expect(Notification.create).toHaveBeenCalledWith(
            expect.objectContaining({ meta: expect.not.objectContaining({ rideId: expect.anything() }) }),
        );
        /** The rest of the metadata survives. */
        expect(Notification.create).toHaveBeenCalledWith(
            expect.objectContaining({ meta: expect.objectContaining({ rideStatus: 'arrived' }) }),
        );
    });

    test('createPersisted keeps a valid authoritative Ride _id', async () => {
        Notification.create.mockResolvedValue(notifDoc());
        const rideId = '64d1d2d0b9f7a1234567890a';

        await notificationService.createPersisted({
            ...params(),
            meta: { rideId },
            channels: { inApp: true },
        });

        expect(Notification.create).toHaveBeenCalledWith(
            expect.objectContaining({ meta: expect.objectContaining({ rideId }) }),
        );
    });

    test('listForReceiver queries ONLY the receiver: user A never sees user B data', async () => {
        Notification.find.mockReturnValue({
            sort: jest.fn(() => ({
                limit: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })),
            })),
        });

        await notificationService.listForReceiver('user-a', 'user', { limit: 10 });

        expect(Notification.find).toHaveBeenCalledWith({ receiverId: 'user-a', receiverType: 'user' });
    });

    test('clearAllForReceiver deletes ONLY the authenticated receiver (clear is scoped)', async () => {
        Notification.deleteMany.mockResolvedValue({ deletedCount: 3 });

        const out = await notificationService.clearAllForReceiver('user-a', 'user');

        expect(Notification.deleteMany).toHaveBeenCalledWith({ receiverId: 'user-a', receiverType: 'user' });
        expect(out.deletedCount).toBe(3);
    });
});
