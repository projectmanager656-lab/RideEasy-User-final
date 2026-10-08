/**
 * Ride completion permanently consumes the booked coupon.
 *
 * Whichever payment rail settles the fare later, a completed ride must settle the
 * coupon redemption so the same passenger can never reuse the code on a later
 * booking (the mock/UPI/cash rails never ran the coupon settlement before).
 */

jest.mock('../../models/rideCore.model', () => ({
    findOne: jest.fn(),
    findById: jest.fn(),
    updateOne: jest.fn(),
}));
jest.mock('../../models/captain.model', () => ({
    updateOne: jest.fn(),
}));
jest.mock('../../services/maps.service', () => ({}));
jest.mock('../../services/coupon.service', () => ({
    settleCouponRedemption: jest.fn(),
}));

const rideModel = require('../../models/rideCore.model');
const captainModel = require('../../models/captain.model');
const couponService = require('../../services/coupon.service');
const rideService = require('../../services/rideCore.service');

/** Chainable query usable as `await q`, `await q.populate().populate()` and `await q.select().lean()`. */
function query(value) {
    const q = {};
    q.populate = jest.fn(() => q);
    q.select = jest.fn(() => q);
    q.lean = jest.fn(() => Promise.resolve(value));
    q.then = (resolve, reject) => Promise.resolve(value).then(resolve, reject);
    return q;
}

function startedRide(overrides = {}) {
    return {
        _id: 'ride-1',
        captain: { _id: 'captain-1' },
        user: { _id: 'user-1' },
        status: 'started',
        startedAt: new Date(Date.now() - 600_000),
        price: 400,
        discountAmount: 100,
        chargedAmount: 300,
        couponCode: 'WELCOME',
        ...overrides,
    };
}

describe('endRide coupon consumption', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        captainModel.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 });
        rideModel.updateOne.mockResolvedValue({ acknowledged: true });
    });

    test('settles the redemption of a completed coupon ride', async () => {
        rideModel.findOne
            .mockReturnValueOnce(query(startedRide()))
            .mockReturnValueOnce(query(null));
        rideModel.findById.mockReturnValue(query(startedRide({ status: 'completed' })));

        await rideService.endRide({ rideId: 'ride-1', captain: { _id: 'captain-1' } });

        expect(rideModel.updateOne).toHaveBeenCalledWith(
            { _id: 'ride-1' },
            expect.objectContaining({ status: 'completed' }),
        );
        expect(couponService.settleCouponRedemption).toHaveBeenCalledWith({ rideId: 'ride-1' });
    });

    test('leaves coupon settlement alone for a ride without a coupon', async () => {
        rideModel.findOne
            .mockReturnValueOnce(query(startedRide({ couponCode: '' })))
            .mockReturnValueOnce(query(null));
        rideModel.findById.mockReturnValue(query(startedRide({ status: 'completed', couponCode: '' })));

        await rideService.endRide({ rideId: 'ride-1', captain: { _id: 'captain-1' } });

        expect(couponService.settleCouponRedemption).not.toHaveBeenCalled();
    });

    test('a settlement failure never fails the completed ride', async () => {
        rideModel.findOne
            .mockReturnValueOnce(query(startedRide()))
            .mockReturnValueOnce(query(null));
        rideModel.findById.mockReturnValue(query(startedRide({ status: 'completed' })));
        couponService.settleCouponRedemption.mockRejectedValue(new Error('wallet hiccup'));

        await expect(
            rideService.endRide({ rideId: 'ride-1', captain: { _id: 'captain-1' } }),
        ).resolves.toBeTruthy();
    });
});
