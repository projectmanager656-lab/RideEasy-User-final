/**
 * Passenger OTP lifecycle — the master flow requirement.
 *
 * The code is minted exclusively by markArrived (accepted -> arrived) and may only
 * be reissued by this endpoint when it genuinely expired or is unrecoverable. A mere
 * refetch must return the SAME code, a pre-arrival read must expose nothing, and a
 * reissue must reach the passenger's screen over the existing socket — never the
 * driver's.
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

    test('an expired window reissues atomically and syncs the passenger only', async () => {
        const doc = rideDoc({ otpExpiresAt: new Date(Date.now() - 60 * 1000) });
        mockRideFetch(doc);
        mockReissue({ otpCipher: 'fresh-cipher', otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000) });
        decryptOtp.mockReturnValue('123456');

        const res = responseFor();
        await rideController.getPassengerOtp(req(), res);

        /* Compare-and-swap on the cipher it read: concurrent refetches cannot both mint. */
        expect(rideModel.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: RIDE_ID, status: 'arrived', otpCipher: 'stale-cipher' },
            { $set: { otpHash: 'hashed-x', otpCipher: 'encrypted-x', otpExpiresAt: expect.any(Date) } },
            { new: true },
        );
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, otp: '123456' }));
        expect(socket.emitToUser).toHaveBeenCalledWith(
            'u1',
            'ride:status-update',
            expect.objectContaining({ rideId: RIDE_ID, status: 'arrived', otpReissued: true }),
        );
        /* The driver verifies the code — it is never pushed to a driver room. */
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
        const doc = rideDoc({ otpExpiresAt: new Date(Date.now() - 60 * 1000) });
        mockRideFetch(doc, { otpCipher: 'winner-cipher', otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000) });
        mockReissue(null);
        decryptOtp.mockReturnValue('999999');

        const res = responseFor();
        await rideController.getPassengerOtp(req(), res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, otp: '999999' }));
        expect(socket.emitToUser).not.toHaveBeenCalled();
    });
});
