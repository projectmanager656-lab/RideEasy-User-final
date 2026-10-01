/**
 * getPassengerOtp self-healing — the master OTP flow requirement: an
 * undecryptable cipher (e.g. JWT_SECRET rotated between markArrived and the
 * passenger's read) must regenerate the OTP and sync BOTH parties, not 500
 * until the window expires.
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

function mockRideFetch(doc) {
    rideModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(doc),
        }),
    });
    rideModel.updateOne.mockReturnValue({});
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

describe('getPassengerOtp self-healing', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('undecryptable cipher (key rotated) regenerates the OTP and syncs both parties', async () => {
        const doc = rideDoc();
        mockRideFetch(doc);
        decryptOtp.mockImplementation(() => {
            throw new Error('Unsupported state or unable to authenticate data');
        });

        const res = responseFor();
        await rideController.getPassengerOtp(req(), res);

        expect(res.status).not.toHaveBeenCalledWith(500);
        expect(rideModel.updateOne).toHaveBeenCalledWith(
            { _id: RIDE_ID },
            { $set: { otpHash: 'hashed-x', otpCipher: 'encrypted-x', otpExpiresAt: expect.any(Date) } },
        );
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                ok: true,
                otp: '123456',
                confirmation: expect.objectContaining({ otp: '123456' }),
            }),
        );
        expect(socket.emitToUser).toHaveBeenCalledWith(
            'u1',
            'ride:status-update',
            expect.objectContaining({ rideId: RIDE_ID, status: 'arrived' }),
        );
        expect(socket.emitToCaptain).toHaveBeenCalled();
    });

    test('a decryptable cipher is returned as-is (no regeneration, no socket emit)', async () => {
        const doc = rideDoc();
        mockRideFetch(doc);
        decryptOtp.mockReturnValue('654321');

        const res = responseFor();
        await rideController.getPassengerOtp(req(), res);

        expect(rideModel.updateOne).not.toHaveBeenCalled();
        expect(socket.emitToUser).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, otp: '654321' }));
    });

    test('an expired window still regenerates (existing behaviour, unified branch)', async () => {
        const doc = rideDoc({ otpExpiresAt: new Date(Date.now() - 60 * 1000) });
        mockRideFetch(doc);

        const res = responseFor();
        await rideController.getPassengerOtp(req(), res);

        expect(rideModel.updateOne).toHaveBeenCalledWith(
            { _id: RIDE_ID },
            { $set: { otpHash: 'hashed-x', otpCipher: 'encrypted-x', otpExpiresAt: expect.any(Date) } },
        );
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, otp: '123456' }));
        expect(socket.emitToUser).toHaveBeenCalled();
    });

    test('non-active statuses are still rejected with 400', async () => {
        mockRideFetch(rideDoc({ status: 'completed' }));

        const res = responseFor();
        await rideController.getPassengerOtp(req(), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(rideModel.updateOne).not.toHaveBeenCalled();
    });
});
