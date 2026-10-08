/**
 * One redemption per user per coupon — the master coupon requirement.
 *
 * A completed ride PERMANENTLY consumes the coupon it was booked with: the
 * reservation is settled (never deleted), the coupon is reported `used` and a
 * manual re-entry is rejected with 409. Only a cancelled ride releases it. The
 * unique (couponId, userId) reservation stays the concurrency guard.
 *
 * `CouponUsage` is backed by an in-memory collection honouring the real filters so
 * "settled, never deleted" is asserted against filter semantics, not call counts.
 */

const state = { usages: [] };

const matches = (doc, filter) => {
    if (filter._id !== undefined && String(doc._id) !== String(filter._id)) return false;
    if (filter.rideId !== undefined && String(doc.rideId) !== String(filter.rideId)) return false;
    if (filter.settled && filter.settled.$ne === true && doc.settled === true) return false;
    if (filter.userId !== undefined && String(doc.userId) !== String(filter.userId)) return false;
    if (filter.couponId && filter.couponId.$in) {
        if (!filter.couponId.$in.map(String).includes(String(doc.couponId))) return false;
    } else if (filter.couponId !== undefined && String(doc.couponId) !== String(filter.couponId)) {
        return false;
    }
    return true;
};

jest.mock('../../models/couponUsage.model', () => ({
    find: jest.fn((filter) => ({
        lean: () => Promise.resolve(state.usages.filter((doc) => matches(doc, filter))),
    })),
    findOne: jest.fn((filter) => Promise.resolve(state.usages.find((doc) => matches(doc, filter)) || null)),
    findOneAndUpdate: jest.fn((filter, update) => {
        const doc = state.usages.find((item) => matches(item, filter));
        if (!doc) return Promise.resolve(null);
        Object.assign(doc, update?.$set || {});
        return Promise.resolve(doc);
    }),
    deleteOne: jest.fn((filter) => {
        const index = state.usages.findIndex((doc) => matches(doc, filter));
        if (index >= 0) state.usages.splice(index, 1);
        return Promise.resolve({ deletedCount: index >= 0 ? 1 : 0 });
    }),
    deleteMany: jest.fn((filter) => {
        const before = state.usages.length;
        state.usages = state.usages.filter((doc) => !matches(doc, filter));
        return Promise.resolve({ deletedCount: before - state.usages.length });
    }),
    create: jest.fn((rows) => {
        const list = Array.isArray(rows) ? rows : [rows];
        state.usages.push(...list.map((row) => ({ ...row, settled: row.settled ?? false })));
        return Promise.resolve(list);
    }),
    exists: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('../../models/coupon.model', () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
}));

jest.mock('../../models/user.model', () => ({
    findByIdAndUpdate: jest.fn(),
    updateOne: jest.fn(),
}));

jest.mock('../../models/rideCore.model', () => ({
    find: jest.fn(),
    findById: jest.fn(),
    countDocuments: jest.fn(),
    updateOne: jest.fn(),
}));

jest.mock('../../models/walletTransaction.model', () => ({
    findOne: jest.fn(),
    create: jest.fn(),
}));

const Coupon = require('../../models/coupon.model');
const CouponUsage = require('../../models/couponUsage.model');
const rideModel = require('../../models/rideCore.model');
const couponService = require('../../services/coupon.service');

/** `rideModel.find(filter).select().limit().lean()` — the stale sweep + list help. */
function rideFindResult(rides) {
    const query = {};
    query.select = jest.fn(() => query);
    query.limit = jest.fn(() => query);
    query.lean = jest.fn(() => Promise.resolve(rides));
    return query;
}

/** `rideModel.findById(...).select().lean()` and a bare `await rideModel.findById(...)`. */
function rideByIdResult(ride) {
    const query = {};
    query.select = jest.fn(() => query);
    query.lean = jest.fn(() => Promise.resolve(ride));
    query.then = (resolve, reject) => Promise.resolve(ride).then(resolve, reject);
    return query;
}

/** `Coupon.find(filter).sort().lean()` */
function couponFindResult(rows) {
    const query = {};
    query.sort = jest.fn(() => query);
    query.lean = jest.fn(() => Promise.resolve(rows));
    return query;
}

function rawCoupon(overrides = {}) {
    return {
        _id: 'coupon-1',
        code: 'WELCOME',
        title: 'Welcome',
        discountType: 'flat',
        discountValue: 100,
        minFare: 0,
        isActive: true,
        validUntil: new Date(Date.now() + 86_400_000),
        usedCount: 0,
        usageLimit: null,
        ...overrides,
    };
}

const RIDE = {
    _id: 'ride-1',
    user: 'user-1',
    price: 400,
    discountAmount: 100,
    couponCode: 'WELCOME',
};

function primeCompletedRedemption({ rideStatus = 'completed' } = {}) {
    state.usages = [{
        _id: 'usage-1',
        couponId: 'coupon-1',
        userId: 'user-1',
        rideId: 'ride-1',
        discountAmount: 100,
        settled: false,
    }];
    const ride = {
        _id: 'ride-1',
        status: rideStatus,
        couponCode: 'WELCOME',
        price: 400,
        user: 'user-1',
    };
    rideModel.find.mockReturnValue(rideFindResult([]));
    rideModel.findById.mockReturnValue(rideByIdResult(ride));
    rideModel.updateOne.mockResolvedValue({ acknowledged: true });
    Coupon.find.mockReturnValue(couponFindResult([rawCoupon()]));
    Coupon.findOne.mockReturnValue({ lean: () => Promise.resolve(rawCoupon()) });
    Coupon.findOneAndUpdate.mockResolvedValue(rawCoupon({ usedCount: 1 }));
}

describe('coupon redemption is permanent once the ride completes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        state.usages = [];
    });

    test('a completed ride marks the coupon used and settles it exactly once', async () => {
        primeCompletedRedemption();

        const first = await couponService.listAvailableCoupons('user-1');

        expect(first[0].used).toBe(true);
        expect(state.usages[0].settled).toBe(true);
        expect(Coupon.findOneAndUpdate).toHaveBeenCalledTimes(1);
        expect(Coupon.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ code: 'WELCOME' }),
            { $inc: { usedCount: 1 } },
            expect.anything(),
        );
        /* The redemption is consumed — the reservation must never be deleted. */
        expect(CouponUsage.deleteOne).not.toHaveBeenCalled();
        expect(CouponUsage.deleteMany).not.toHaveBeenCalled();
    });

    test('a repeated read stays used and never double-increments', async () => {
        primeCompletedRedemption();

        await couponService.listAvailableCoupons('user-1');
        const second = await couponService.listAvailableCoupons('user-1');

        expect(second[0].used).toBe(true);
        expect(Coupon.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    test('manually re-entering a completed ride\'s coupon is rejected with 409', async () => {
        primeCompletedRedemption();

        const error = await couponService
            .validateCoupon({ code: 'WELCOME', userId: 'user-1', fare: 400 })
            .catch((err) => err);

        expect(error.statusCode).toBe(409);
        expect(error.message).toBe('Coupon has already been used');
        expect(CouponUsage.deleteOne).not.toHaveBeenCalled();
        expect(state.usages).toHaveLength(1);
    });

    test('a coupon held by a live ride is already unusable for the next booking', async () => {
        primeCompletedRedemption({ rideStatus: 'accepted' });

        const error = await couponService
            .validateCoupon({ code: 'WELCOME', userId: 'user-1', fare: 400 })
            .catch((err) => err);

        expect(error.statusCode).toBe(409);
    });

    test('another user is unaffected by that redemption', async () => {
        primeCompletedRedemption();

        const result = await couponService.validateCoupon({
            code: 'WELCOME',
            userId: 'user-2',
            fare: 400,
        });

        expect(result.discountAmount).toBe(100);
        expect(result.finalFare).toBe(300);
    });
});

describe('cancelled rides keep the existing release policy', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        state.usages = [];
    });

    test('a cancelled ride releases the reservation and the coupon is available again', async () => {
        primeCompletedRedemption({ rideStatus: 'cancelled' });

        const list = await couponService.listAvailableCoupons('user-1');

        expect(list[0].used).toBe(false);
        expect(state.usages).toHaveLength(0);
        expect(Coupon.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('a cancelled ride no longer blocks a fresh redemption', async () => {
        primeCompletedRedemption({ rideStatus: 'cancelled' });

        const result = await couponService.validateCoupon({
            code: 'WELCOME',
            userId: 'user-1',
            fare: 400,
        });

        expect(result.discountAmount).toBe(100);
        expect(state.usages).toHaveLength(0);
    });
});

describe('concurrency-safe reservation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        state.usages = [];
    });

    test('a duplicate claim maps the unique index violation to a clear 409', async () => {
        CouponUsage.create.mockImplementationOnce(() => {
            const error = new Error('E11000 duplicate key');
            error.code = 11000;
            return Promise.reject(error);
        });

        const error = await couponService
            .reserveCoupon({
                coupon: { _id: 'coupon-1', code: 'WELCOME' },
                userId: 'user-1',
                rideId: 'ride-9',
                discountAmount: 100,
            })
            .catch((err) => err);

        expect(error.statusCode).toBe(409);
        expect(error.message).toBe('Coupon has already been used');
    });
});

describe('settleCouponRedemption', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        state.usages = [];
    });

    test('flips the reservation once and thickens the global counter exactly once', async () => {
        primeCompletedRedemption();
        rideModel.findById.mockReturnValue(rideByIdResult(RIDE));

        const first = await couponService.settleCouponRedemption({ rideId: 'ride-1' });
        const second = await couponService.settleCouponRedemption({ rideId: 'ride-1' });

        expect(first.alreadySettled).toBe(false);
        expect(second.alreadySettled).toBe(true);
        expect(Coupon.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });
});
