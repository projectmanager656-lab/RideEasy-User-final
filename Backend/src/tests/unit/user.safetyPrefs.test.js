/**
 * POST/GET /users/safety-prefs — the Safety screen toggles used to live only in
 * localStorage, so they were lost on any other device and never reached the database.
 */

jest.mock('../../models/user.model', () => ({
    findById: jest.fn(),
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    hashPassword: jest.fn(),
}));
jest.mock('../../models/blackListToken.model', () => ({ findOne: jest.fn() }));
jest.mock('../../models/userOnboarding.model', () => ({}));
jest.mock('../../models/walletTransaction.model', () => ({}));
jest.mock('../../models/recentSearch.model', () => ({}));
jest.mock('../../models/savedLocation.model', () => ({}));
jest.mock('../../models/sosEvent.model', () => ({}));
jest.mock('../../models/emergencyContact.model', () => ({}));
jest.mock('../../services/notification.service', () => ({}));
jest.mock('../../services/coupon.service', () => ({
    listAvailableCoupons: jest.fn(),
    validateCoupon: jest.fn(),
}));

const userModel = require('../../models/user.model');
const userController = require('../../controllers/user.controller');

function responseFor() {
    const response = {};
    response.set = jest.fn();
    response.status = jest.fn(() => response);
    response.json = jest.fn((body) => body);
    return response;
}

const authReq = (body) => ({ user: { _id: 'user-1' }, body });

describe('safety preferences', () => {
    beforeEach(() => jest.clearAllMocks());

    test('GET returns all three toggles with defaults when nothing is stored', async () => {
        userModel.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'user-1' }) }) });
        const response = responseFor();

        await userController.getSafetyPrefs(authReq({}), response);

        expect(response.status).toHaveBeenCalledWith(200);
        const payload = response.json.mock.calls[0][0];
        expect(payload.data.safetyPrefs).toEqual({
            shareTripAutomatically: false,
            shareLiveLocation: true,
            safetyNotifications: true,
        });
    });

    test('PATCH persists a single toggle and returns the merged set', async () => {
        userModel.findByIdAndUpdate.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    _id: 'user-1',
                    safetyPrefs: { shareTripAutomatically: true, shareLiveLocation: true, safetyNotifications: true },
                }),
            }),
        });
        const response = responseFor();

        await userController.updateSafetyPrefs(authReq({ shareTripAutomatically: true }), response);

        expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
            'user-1',
            { $set: { 'safetyPrefs.shareTripAutomatically': true } },
            { new: true },
        );
        expect(response.json.mock.calls[0][0].data.safetyPrefs.shareTripAutomatically).toBe(true);
    });

    test('PATCH rejects a non-boolean value', async () => {
        const response = responseFor();

        await userController.updateSafetyPrefs(authReq({ shareLiveLocation: 'yes' }), response);

        expect(response.status).toHaveBeenCalledWith(400);
        expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test('PATCH rejects an unknown/empty payload', async () => {
        const response = responseFor();

        await userController.updateSafetyPrefs(authReq({ somethingElse: true }), response);

        expect(response.status).toHaveBeenCalledWith(400);
        expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });
});
