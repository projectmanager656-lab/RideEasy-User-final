const { toPublicDoc } = require('../../utils/publicDoc');

function makeDoc (fields, modelName) {
    return {
        constructor: { modelName },
        toObject: () => ({ ...fields }),
    };
}

describe('toPublicDoc', () => {
    test('does not expose legacy city or bank details for users', () => {
        const user = toPublicDoc(makeDoc({
            name: 'Test User',
            city: 'Kolhapur',
            bankDetails: { accountNumber: '123456789' },
            password: 'secret',
        }, 'user'));

        expect(user).toEqual({ name: 'Test User' });
    });

    test('preserves captain profile information without legacy bank details', () => {
        const captain = toPublicDoc(makeDoc({
            servingCity: 'Kolhapur',
            bankDetails: { accountNumber: '123456789' },
            vehicleType: 'AUTO',
            vehicleNumber: 'MH12AB1234',
            license: 'LIC12345',
            upiId: 'captain@upi',
            paymentQrUrl: 'https://example.test/qr',
        }, 'captain'));

        expect(captain.vehicleType).toBe('AUTO');
        expect(captain.vehicleNumber).toBe('MH12AB1234');
        expect(captain.license).toBe('LIC12345');
        expect(captain.servingCity).toBe('Kolhapur');
        expect(captain.bankDetails).toBeUndefined();
    });
});
