const captainModel = require('../../models/captain.model');

jest.mock('../../models/captain.model', () => ({
    findByIdAndUpdate: jest.fn(),
    findById: jest.fn(),
}));

const {
    expiresAfterPlan,
    syncSubscriptionState,
    isSubscriptionValid,
} = require('../../services/subscriptionDriver.service');

describe('subscriptionDriver.service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('expiresAfterPlan', () => {
        it('adds 7 days for weekly', () => {
            const from = new Date('2026-03-01T12:00:00.000Z');
            const out = expiresAfterPlan('weekly', from);
            expect(out.toISOString()).toBe('2026-03-08T12:00:00.000Z');
        });

        it('adds one month for monthly', () => {
            const from = new Date('2026-01-15T12:00:00.000Z');
            const out = expiresAfterPlan('monthly', from);
            expect(out.getUTCMonth()).toBe(1);
            expect(out.getUTCFullYear()).toBe(2026);
        });

        it('adds one year for yearly', () => {
            const from = new Date('2025-06-15T00:00:00.000Z');
            const out = expiresAfterPlan('yearly', from);
            expect(out.getFullYear()).toBe(2026);
        });

        it('defaults unknown plan to +7 days', () => {
            const from = new Date('2026-03-01T12:00:00.000Z');
            const out = expiresAfterPlan('unknown', from);
            expect(out.toISOString()).toBe('2026-03-08T12:00:00.000Z');
        });
    });

    describe('isSubscriptionValid', () => {
        it('returns false when captain is missing', () => {
            expect(isSubscriptionValid(null)).toBe(false);
        });

        it('returns false when status is not active', () => {
            expect(isSubscriptionValid({ subscriptionStatus: 'expired' })).toBe(false);
        });

        it('returns true when active with no expiry', () => {
            expect(isSubscriptionValid({ subscriptionStatus: 'active' })).toBe(true);
        });

        it('returns false when expiry is in the past', () => {
            expect(
                isSubscriptionValid({
                    subscriptionStatus: 'active',
                    subscriptionExpiresAt: new Date('2020-01-01'),
                }),
            ).toBe(false);
        });

        it('returns true when expiry is in the future', () => {
            expect(
                isSubscriptionValid({
                    subscriptionStatus: 'active',
                    subscriptionExpiresAt: new Date('2030-01-01'),
                }),
            ).toBe(true);
        });
    });

    describe('syncSubscriptionState', () => {
        it('returns null when captainDoc is falsy', async () => {
            expect(await syncSubscriptionState(null)).toBeNull();
            expect(captainModel.findByIdAndUpdate).not.toHaveBeenCalled();
        });

        it('backfills subscriptionExpiresAt when active and missing expiry', async () => {
            const id = { toString: () => '507f1f77bcf86cd799439011' };
            const started = new Date('2026-03-01T00:00:00.000Z');
            const doc = {
                _id: id,
                subscriptionStatus: 'active',
                subscriptionStartedAt: started,
                subscriptionExpiresAt: null,
            };
            const updated = { ...doc, subscriptionExpiresAt: new Date('2026-04-01T00:00:00.000Z') };
            captainModel.findByIdAndUpdate.mockResolvedValue(doc);
            captainModel.findById.mockResolvedValue(updated);

            const result = await syncSubscriptionState(doc);

            expect(captainModel.findByIdAndUpdate).toHaveBeenCalledWith(
                id,
                expect.objectContaining({ subscriptionExpiresAt: expect.any(Date) }),
            );
            expect(captainModel.findById).toHaveBeenCalledWith(id);
            expect(result).toEqual(updated);
        });

        it('marks expired when active but end date passed', async () => {
            const id = { toString: () => '507f1f77bcf86cd799439011' };
            const past = new Date('2020-01-01T00:00:00.000Z');
            const doc = {
                _id: id,
                subscriptionStatus: 'active',
                subscriptionExpiresAt: past,
            };
            captainModel.findByIdAndUpdate.mockResolvedValue(doc);
            captainModel.findById.mockResolvedValue({ ...doc, subscriptionStatus: 'expired' });

            await syncSubscriptionState(doc);

            expect(captainModel.findByIdAndUpdate).toHaveBeenCalledWith(
                id,
                expect.objectContaining({ subscriptionStatus: 'expired' }),
            );
        });

        it('does not update DB when no patch needed', async () => {
            const future = new Date('2030-01-01T00:00:00.000Z');
            const doc = {
                _id: 'id1',
                subscriptionStatus: 'active',
                subscriptionExpiresAt: future,
            };
            captainModel.findById.mockResolvedValue(doc);

            const result = await syncSubscriptionState(doc);

            expect(captainModel.findByIdAndUpdate).not.toHaveBeenCalled();
            expect(result).toBe(doc);
        });
    });
});
