/**
 * Passenger OTP lifecycle — the master flow requirement.
 *
 * The code is minted exclusively by markArrived (accepted -> arrived) and is NEVER
 * rotated by a refetch: one ride = one final OTP, stored on the ride document and
 * returned as-is forever (refresh, reconnect, repeated arrival, payment success).
 * A reissue may happen only when the stored cipher is unreadable (infra), and a
 * pre-arrival or unpaid read must expose nothing. A reissue must reach the
 * passenger's screen over the existing socket — never the driver's.
 */

jest.mock('../../services/rideCore.service', () => ({
    normalizeVehicleType: jest.fn((t) => t),
}));
jest.mock('../../services/payment.service', () => ({}));
jest.mock('../../services/wallet.service', () => ({ payRideFromWallet: jest.fn() }));
jest.mock('../../services/coupon.service', () => ({
    validateCoupon: jest.fn(),
    reserveCoupon: jest.fn(),
    releaseCoupon: jest.fn(),
}));
jest.mock('../../services/rating.service', () => ({}));
jest.mock('../../services/pricing.service', () => ({ getCaptainPricing: jest.fn() }));
jest.mock('../../services/maps.service', () => ({ getDrivingRoute: jest.fn() }));
jest.mock('../../services/notification.service', () => ({}));
jest.mock('../../services/invoice.service', () => ({}));
jest.mock('../../services/refund.service', () => ({}));
jest.mock('../../services/rideDispatch.service', () => ({
    recordDispatchAttemptSafe: jest.fn(),
    markRideDispatchedStatusSafe: jest.fn(),
}));
jest.mock('../../models/paymentRecord.model', () => ({}));
jest.mock('../../models/captain.model', () => ({}));
jest.mock('../../models/rideShare.model', () => ({}));
jest.mock('../../models/rideCore.model', () => ({
    findById: jest.fn(),
    updateOne: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
}));
jest.mock('../../utils/otpSecure', () => ({
    decryptOtp: jest.fn(),
    encryptOtp: jest.fn(() => 'encrypted-x'),
    hashOtp: jest.fn(async () => 'hashed-x'),
}));
jest.mock('../../utils/otp', () => ({
    expiresInMinutes: jest.fn(() => new Date(Date.now() + 5 * 60 * 1000)),
    randomSixDigit: jest.fn(() => '123456'),
}));
jest.mock('../../utils/serviceArea', () => ({
    isWithinServiceArea: jest.fn(),
    inferServiceCityKeyOrNearest: jest.fn(),
    ridePickupInServiceArea: jest.fn(),
    logServiceAreaDistances: jest.fn(),
    captainServingCityMatch: jest.fn(),
    cityKey: jest.fn(),
    SERVICE_AREA_ERROR: 'SERVICE_AREA_ERROR',
}));
jest.mock('../../socket', () => ({
    emitToUser: jest.fn(),
    emitToCaptain: jest.fn(),
    emitStandardRidePhase: jest.fn(),
    driverRoomBySocketId: new Map(),
}));
jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({})));

const rideModel = require('../../models/rideCore.model');
const { decryptOtp } = require('../../utils/otpSecure');
const socket = require('../../socket');
const rideController = require('../../controllers/ride.controller');

const RIDE_ID = '6abe22649eb5b22d425eaf8c';

function rideDoc(overrides = {}) {
    return {
        _id: RIDE_ID,
        user: 'u1',
        captain: null,
        status: 'arrived',
        /** New release contract: arrived AND backend-verified advance. */
        advancePaymentStatus: 'success',
        otpCipher: 'stale-cipher',
        otpExpiresAt: new Date(Date.now() + 4 * 60 * 1000),
        ...overrides,
    };
}

/** `.select().populate()` / `await .select()` — both chains of the same query. */
function chainable(doc, awaited) {
    const chain = {};
    chain.select = jest.fn(() => chain);
    chain.populate = jest.fn(() => Promise.resolve(doc));
    chain.then = (resolve, reject) =>
        Promise.resolve(awaited !== undefined ? awaited : doc).then(resolve, reject);
    return chain;
}

function mockRideFetch(doc, winnerDoc) {
    rideModel.findById.mockReturnValue(chainable(doc));
    if (winnerDoc !== undefined) {
        rideModel.findById
            .mockReturnValueOnce(chainable(doc))
            .mockReturnValueOnce(chainable(winnerDoc));
    }
    rideModel.updateOne.mockReturnValue({});
}

function mockReissue(result) {
    rideModel.findOneAndUpdate.mockReturnValue({
        select: jest.fn(() => Promise.resolve(result)),
    });
}

function responseFor() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn((body) => body);
    return res;
}

const req = () => ({
    params: { id: RIDE_ID },
    user: { _id: 'u1' },
});

describe('getPassengerOtp — arrival-gated, stable, atomic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('never mints an OTP before the driver arrives', async () => {
        mockRideFetch(rideDoc({ status: 'accepted', otpCipher: undefined }));

        const res = responseFor();
        await rideController.getPassengerOtp(req(), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(rideModel.updateOne).not.toHaveBeenCalled();
        expect(rideModel.findOneAndUpdate).not.toHaveBeenCalled();
        expect(socket.emitToUser).not.toHaveBeenCalled();
    });

    test.each(['pending', 'failed'])(
        'releases nothing for an arrived ride whose advance is %s — no read, no mint, no emit',
        async (advancePaymentStatus) => {
            mockRideFetch(rideDoc({ advancePaymentStatus, otpCipher: undefined }));

            const res = responseFor();
            await rideController.getPassengerOtp(req(), res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(decryptOtp).not.toHaveBeenCalled();
            expect(rideModel.findOneAndUpdate).not.toHaveBeenCalled();
            expect(socket.emitToUser).not.toHaveBeenCalled();
        },
    );

    test('a fully-paid ride (paymentStatus success) also satisfies the advance condition', async () => {
        mockRideFetch(rideDoc({ advancePaymentStatus: 'pending', paymentStatus: 'success' }));
        decryptOtp.mockReturnValue('654321');

        const res = responseFor();
        await rideController.getPassengerOtp(req(), res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ ok: true, otp: '654321' }),
        );
    });

    test.each(['searching', 'started', 'completed', 'cancelled'])(
        'exposes nothing for a %s ride and writes nothing',
        async (status) => {
            mockRideFetch(rideDoc({ status }));

            const res = responseFor();
            await rideController.getPassengerOtp(req(), res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(rideModel.updateOne).not.toHaveBeenCalled();
            expect(rideModel.findOneAndUpdate).not.toHaveBeenCalled();
        },
    );

    test('a still-valid code is returned as-is — a refetch never rotates it', async () => {
        mockRideFetch(rideDoc());
        decryptOtp.mockReturnValue('654321');

        const res = responseFor();
        await rideController.getPassengerOtp(req(), res);

        expect(res.status).not.toHaveBeenCalledWith(500);
        expect(rideModel.findOneAndUpdate).not.toHaveBeenCalled();
        expect(rideModel.updateOne).not.toHaveBeenCalled();
        expect(socket.emitToUser).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                ok: true,
                otp: '654321',
                confirmation: expect.objectContaining({ otp: '654321' }),
            }),
        );
    });

    test('an expired window returns the SAME stored code — never re-mints on refresh', async () => {
        const doc = rideDoc({ otpExpiresAt: new Date(Date.now() - 60 * 1000) });
        mockRideFetch(doc);
        decryptOtp.mockReturnValue('123456');

        const res = responseFor();
        await rideController.getPassengerOtp(req(), res);

        /* ONE RIDE = ONE FINAL OTP: a refetch after the old window is read-only. */
        expect(rideModel.findOneAndUpdate).not.toHaveBeenCalled();
        expect(rideModel.updateOne).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, otp: '123456' }));
        expect(socket.emitToUser).not.toHaveBeenCalled();
        expect(socket.emitToCaptain).not.toHaveBeenCalled();
    });

    test('an undecryptable cipher (key rotated) is reissued and synced', async () => {
        mockRideFetch(rideDoc());
        mockReissue({ otpCipher: 'fresh-cipher', otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000) });
        decryptOtp
            .mockImplementationOnce(() => {
                throw new Error('Unsupported state or unable to authenticate data');
            })
            .mockReturnValue('123456');

        const res = responseFor();
        await rideController.getPassengerOtp(req(), res);

        expect(res.status).not.toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, otp: '123456' }));
        expect(socket.emitToUser).toHaveBeenCalled();
        expect(socket.emitToCaptain).not.toHaveBeenCalled();
    });

    test('losing the reissue race serves the winner\'s code without a second mint', async () => {
        /* Reissue is only reachable when the stored cipher is unreadable (infra),
         * never because of an expiry window. */
        const doc = rideDoc({ otpCipher: 'unreadable-cipher' });
        mockRideFetch(doc, { otpCipher: 'winner-cipher', otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000) });
        mockReissue(null);
        decryptOtp
            .mockImplementationOnce(() => {
                throw new Error('Unsupported state or unable to authenticate data');
            })
            .mockReturnValue('999999');

        const res = responseFor();
        await rideController.getPassengerOtp(req(), res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, otp: '999999' }));
        expect(socket.emitToUser).not.toHaveBeenCalled();
    });
});
