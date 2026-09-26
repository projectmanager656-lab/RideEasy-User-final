/**
 * Stale-searching-ride coupon release.
 *
 * `releaseStaleCouponReservations` is the new maintenance pass that frees coupons held
 * by rides the app already treats as dead (searching past PENDING_RIDE_MAX_AGE_MIN).
 * `CouponUsage.deleteMany` is backed by an in-memory collection that honours the
 * `{ rideId, settled: { $ne: true } }` filter, so the "settled rows are never touched"
 * guarantee is asserted against real filter semantics rather than a bare call count.
 */

const state = { couponUsages: [] };

jest.mock('../../models/coupon.model', () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
}));

jest.mock('../../models/couponUsage.model', () => {
    const matches = (doc, filter) => {
        if (filter.rideId !== undefined && String(doc.rideId) !== String(filter.rideId)) return false;
        // settled: { $ne: true } -> matches anything that is not exactly true
        if (filter.settled && filter.settled.$ne === true && doc.settled === true) return false;
        if (filter.userId !== undefined && String(doc.userId) !== String(filter.userId)) return false;
        if (filter.couponId && filter.couponId.$in) {
            const ids = filter.couponId.$in.map(String);
            if (!ids.includes(String(doc.couponId))) return false;
        } else if (filter.couponId !== undefined && String(doc.couponId) !== String(filter.couponId)) {
            return false;
        }
        return true;
    };
    const findQuery = (filter) => {
        const query = {};
        query.select = jest.fn(() => query);
        query.lean = jest.fn(() => Promise.resolve(state.couponUsages.filter((doc) => matches(doc, filter))));
        return query;
    };
    return {
        __collection: () => state.couponUsages,
        find: jest.fn((filter) => findQuery(filter)),
        findOne: jest.fn(),
        findOneAndUpdate: jest.fn(),
        exists: jest.fn((filter) =>
            Promise.resolve(state.couponUsages.some((doc) => matches(doc, filter)) ? { _id: 'usage-x' } : null),
        ),
        create: jest.fn((rows) => {
            const list = Array.isArray(rows) ? rows : [rows];
            state.couponUsages.push(...list.map((row) => ({ ...row, settled: row.settled ?? false })));
            return Promise.resolve(list);
        }),
        deleteMany: jest.fn((filter) => {
            const before = state.couponUsages.length;
            state.couponUsages = state.couponUsages.filter((doc) => !matches(doc, filter));
            return Promise.resolve({ deletedCount: before - state.couponUsages.length });
        }),
    };
});

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

/** `rideModel.find(filter).select().limit().lean()` */
function rideFindResult(rides) {
    const query = {};
    query.select = jest.fn(() => query);
    query.limit = jest.fn(() => query);
    query.lean = jest.fn(() => Promise.resolve(rides));
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
        code: 'RIDE100',
        discountType: 'flat',
        discountValue: 100,
        minFare: 0,
        isActive: true,
        validUntil: new Date(Date.now() + 86_400_000),
        ...overrides,
    };
}

describe('releaseStaleCouponReservations', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        state.couponUsages = [];
    });

    test('TEST 1: releases the reservation of a stale searching ride and makes the coupon available again', async () => {
        const staleRide = { _id: 'ride-stale-1' };
        state.couponUsages = [
            { couponId: 'coupon-1', userId: 'user-1', rideId: 'ride-stale-1', settled: false },
        ];
        rideModel.find.mockReturnValue(rideFindResult([staleRide]));

        const result = await couponService.releaseStaleCouponReservations();

        expect(result).toEqual({ staleRides: 1, released: 1 });
        expect(CouponUsage.deleteMany).toHaveBeenCalledWith({
            rideId: 'ride-stale-1',
            settled: { $ne: true },
        });
        expect(state.couponUsages).toHaveLength(0);

        // The passenger sees the coupon again.
        Coupon.find.mockReturnValue(couponFindResult([rawCoupon()]));
        const list = await couponService.listAvailableCoupons('user-1');
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({ code: 'RIDE100', used: false });
    });

    test('TEST 2: a stale ride with no coupon reservation cleans up without error', async () => {
        rideModel.find.mockReturnValue(rideFindResult([{ _id: 'ride-no-coupon' }]));

        const result = await couponService.releaseStaleCouponReservations();

        expect(result).toEqual({ staleRides: 1, released: 0 });
        expect(CouponUsage.deleteMany).toHaveBeenCalledTimes(1);
    });

    test('TEST 3: a settled redemption is never released', async () => {
        state.couponUsages = [
            { couponId: 'coupon-1', userId: 'user-1', rideId: 'ride-settled', settled: true },
        ];
        rideModel.find.mockReturnValue(rideFindResult([{ _id: 'ride-settled' }]));

        const result = await couponService.releaseStaleCouponReservations();

        expect(result).toEqual({ staleRides: 1, released: 0 });
        expect(state.couponUsages).toHaveLength(1);
        expect(state.couponUsages[0].settled).toBe(true);
    });

    test('TEST 3b: an unsettled reservation on a still-live searching ride is left alone', async () => {
        // Only rides older than the cutoff are returned by the mongo query.
        rideModel.find.mockReturnValue(rideFindResult([]));
        CouponUsage.deleteMany.mockClear();

        const result = await couponService.releaseStaleCouponReservations();

        expect(result).toEqual({ staleRides: 0, released: 0 });
        expect(CouponUsage.deleteMany).not.toHaveBeenCalled();
        const [filter] = rideModel.find.mock.calls[0];
        expect(filter.status).toBe('searching');
        expect(filter.createdAt.$lt).toBeInstanceOf(Date);
    });

    test('TEST 4: running the sweep twice is harmless and does not duplicate effects', async () => {
        state.couponUsages = [
            { couponId: 'coupon-1', userId: 'user-1', rideId: 'ride-stale-1', settled: false },
        ];
        rideModel.find.mockReturnValue(rideFindResult([{ _id: 'ride-stale-1' }]));

        const first = await couponService.releaseStaleCouponReservations();
        const second = await couponService.releaseStaleCouponReservations();

        expect(first).toEqual({ staleRides: 1, released: 1 });
        expect(second).toEqual({ staleRides: 1, released: 0 });
        expect(state.couponUsages).toHaveLength(0);
        expect(CouponUsage.deleteMany).toHaveBeenCalledTimes(2);
    });

    test('releases only reservations belonging to stale rides', async () => {
        state.couponUsages = [
            { couponId: 'coupon-1', userId: 'user-1', rideId: 'ride-stale-1', settled: false },
            { couponId: 'coupon-2', userId: 'user-1', rideId: 'ride-active', settled: false },
        ];
        rideModel.find.mockReturnValue(rideFindResult([{ _id: 'ride-stale-1' }]));

        const result = await couponService.releaseStaleCouponReservations();

        expect(result.released).toBe(1);
        expect(state.couponUsages).toHaveLength(1);
        expect(String(state.couponUsages[0].rideId)).toBe('ride-active');
    });

    test('honours PENDING_RIDE_MAX_AGE_MIN for the staleness cutoff', async () => {
        const prev = process.env.PENDING_RIDE_MAX_AGE_MIN;
        process.env.PENDING_RIDE_MAX_AGE_MIN = '45';
        rideModel.find.mockReturnValue(rideFindResult([]));
        const now = new Date('2026-09-21T12:00:00.000Z');

        await couponService.releaseStaleCouponReservations({ now });

        const [{ createdAt }] = rideModel.find.mock.calls[0];
        expect(createdAt.$lt.toISOString()).toBe('2026-09-21T11:15:00.000Z');
        if (prev === undefined) delete process.env.PENDING_RIDE_MAX_AGE_MIN;
        else process.env.PENDING_RIDE_MAX_AGE_MIN = prev;
    });
});

describe('coupon lifecycle regression (TEST 5)', () => {
    const userId = 'user-1';
    const rideId = 'ride-lifecycle';

    beforeEach(() => {
        jest.clearAllMocks();
        state.couponUsages = [];
        Coupon.find.mockReturnValue(couponFindResult([rawCoupon()]));
        Coupon.findOne.mockReturnValue({ lean: () => Promise.resolve(rawCoupon()) });
    });

    test('book with coupon -> used -> cancel releases -> coupon available and applicable again', async () => {
        // 1. booking reserves the coupon
        await couponService.reserveCoupon({
            coupon: { _id: 'coupon-1' },
            userId,
            rideId,
            discountAmount: 100,
        });
        expect(state.couponUsages).toHaveLength(1);
        expect(state.couponUsages[0].settled).toBe(false);

        // 2. while the ride is live the coupon reads as used, and re-applying is rejected
        let list = await couponService.listAvailableCoupons(userId);
        expect(list[0].used).toBe(true);
        await expect(couponService.validateCoupon({ code: 'RIDE100', userId, fare: 350 }))
            .rejects.toMatchObject({ statusCode: 409 });

        // 3. cancelling the ride releases the reservation
        rideModel.find.mockReturnValue(rideFindResult([{ _id: rideId }]));
        const sweep = await couponService.releaseStaleCouponReservations();
        expect(sweep.released).toBe(1);

        // 4. the coupon is available again and validates successfully
        list = await couponService.listAvailableCoupons(userId);
        expect(list[0].used).toBe(false);
        const result = await couponService.validateCoupon({ code: 'RIDE100', userId, fare: 350 });
        expect(result.discountAmount).toBe(100);
        expect(result.finalFare).toBe(250);
    });

    test('a settled redemption survives the stale sweep', async () => {
        state.couponUsages = [
            { couponId: 'coupon-1', userId, rideId: 'ride-completed', settled: true },
        ];
        rideModel.find.mockReturnValue(rideFindResult([{ _id: 'ride-completed' }]));

        const sweep = await couponService.releaseStaleCouponReservations();

        expect(sweep.released).toBe(0);
        expect(state.couponUsages).toHaveLength(1);
        const list = await couponService.listAvailableCoupons(userId);
        expect(list[0].used).toBe(true);
    });
});
