/**
 * OTP visibility & arrival payloads.
 *
 * The passenger PIN is part of the arrival state: it must never appear for a ride
 * the driver has not arrived on, and it must never reach the driver — neither in the
 * arrival response nor through any socket room.
 */

jest.mock('../../services/rideCore.service', () => ({
    markArrived: jest.fn(),
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
jest.mock('../../services/notification.service', () => ({ createIdempotent: jest.fn() }));
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
const rideService = require('../../services/rideCore.service');
const { decryptOtp } = require('../../utils/otpSecure');
const socket = require('../../socket');
const rideController = require('../../controllers/ride.controller');

const RIDE_ID = '6abe22649eb5b22d425eaf8c';
const USER_ID = 'u1';
const CAPTAIN_ID = 'c1';

/** `.populate().populate()` and `await .select()` resolve the same document. */
function query(doc) {
    const q = {};
    q.populate = jest.fn(() => q);
    q.select = jest.fn(() => q);
    q.then = (resolve, reject) => Promise.resolve(doc).then(resolve, reject);
    return q;
}

function rideDoc(overrides = {}) {
    return {
        _id: RIDE_ID,
        user: { _id: USER_ID },
        captain: { _id: CAPTAIN_ID, name: 'Driver', phone: '9999999999' },
        status: 'arrived',
        price: 400,
        discountAmount: 0,
        otpCipher: 'cipher-x',
        otpExpiresAt: new Date(Date.now() + 4 * 60 * 1000),
        ...overrides,
    };
}

function responseFor() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn((body) => body);
    return res;
}

describe('getRideById OTP visibility', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        rideModel.findById.mockReturnValue(query(rideDoc()));
    });

    test('never exposes the OTP while the driver is still en route', async () => {
        rideModel.findById.mockReturnValue(query(rideDoc({ status: 'accepted' })));
        decryptOtp.mockReturnValue('654321');

        const res = responseFor();
        await rideController.getRideById({ params: { id: RIDE_ID }, user: { _id: USER_ID } }, res);

        const body = res.json.mock.calls[0][0];
        expect(body.otp).toBeUndefined();
        expect(body.confirmation.otp).toBeUndefined();
    });

    test('exposes the OTP to the passenger once arrived', async () => {
        decryptOtp.mockReturnValue('654321');

        const res = responseFor();
        await rideController.getRideById({ params: { id: RIDE_ID }, user: { _id: USER_ID } }, res);

        const body = res.json.mock.calls[0][0];
        expect(body.otp).toBe('654321');
        expect(body.confirmation.otp).toBe('654321');
    });

    test('never exposes the OTP to the assigned captain', async () => {
        decryptOtp.mockReturnValue('654321');

        const res = responseFor();
        await rideController.getRideById(
            { params: { id: RIDE_ID }, captain: { _id: CAPTAIN_ID } },
            res,
        );

        const body = res.json.mock.calls[0][0];
        expect(body.otp).toBeUndefined();
        expect(body.confirmation.otp).toBeUndefined();
    });

    test('never surfaces an expired code', async () => {
        rideModel.findById.mockReturnValue(
            query(rideDoc({ otpExpiresAt: new Date(Date.now() - 60 * 1000) })),
        );

        const res = responseFor();
        await rideController.getRideById({ params: { id: RIDE_ID }, user: { _id: USER_ID } }, res);

        const body = res.json.mock.calls[0][0];
        expect(body.otp).toBeUndefined();
        expect(rideModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
});

describe('arriveRide payloads', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const statusFrame = () =>
        socket.emitToUser.mock.calls.find(([, event]) => event === 'ride:status-update');

    test('sends the fresh PIN to the passenger only, never to the driver', async () => {
        rideService.markArrived.mockResolvedValue({
            ride: { _id: RIDE_ID, user: USER_ID, status: 'arrived' },
            otpPlain: '123456',
        });
        rideModel.findById.mockReturnValue(query(rideDoc()));

        const res = responseFor();
        await rideController.arriveRide({ body: { rideId: RIDE_ID }, captain: { _id: CAPTAIN_ID } }, res);

        const frame = statusFrame();
        expect(frame).toBeTruthy();
        expect(frame[0]).toBe(USER_ID);
        expect(frame[2]).toEqual(
            expect.objectContaining({
                rideId: RIDE_ID,
                status: 'arrived',
                confirmation: expect.objectContaining({ otp: '123456' }),
            }),
        );

        const body = res.json.mock.calls[0][0];
        expect(body.confirmation?.otp).toBeUndefined();
        expect(body.otp).toBeUndefined();
        expect(socket.emitToCaptain).not.toHaveBeenCalled();
    });

    test('a repeated arrival emits no new code and rotates nothing', async () => {
        rideService.markArrived.mockResolvedValue({
            ride: { _id: RIDE_ID, user: USER_ID, status: 'arrived' },
            otpPlain: null,
        });
        rideModel.findById.mockReturnValue(query(rideDoc()));

        const res = responseFor();
        await rideController.arriveRide({ body: { rideId: RIDE_ID }, captain: { _id: CAPTAIN_ID } }, res);

        const frame = statusFrame();
        expect(frame).toBeTruthy();
        expect(frame[2].confirmation.otp).toBeUndefined();
        expect(rideModel.findOneAndUpdate).not.toHaveBeenCalled();
        expect(rideModel.updateOne).not.toHaveBeenCalled();
    });
});
