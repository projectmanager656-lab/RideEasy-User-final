const { validationResult } = require('express-validator');
const { registerCaptainValidators } = require('../../validators/auth.validators');

async function validate (body) {
    const req = { body };
    for (const validator of registerCaptainValidators) await validator.run(req);
    return validationResult(req).array();
}

describe('registerCaptainValidators', () => {
    const validRegistration = {
        name: 'Test Captain',
        phone: '8888887777',
        email: 'captain@example.com',
        password: 'Test@123456',
    };

    test('accepts the four Phase 1 registration fields', async () => {
        expect(await validate(validRegistration)).toEqual([]);
    });

    test('does not require an OTP or reject unrelated extra fields', async () => {
        expect(await validate({ ...validRegistration, otp: undefined, city: 'Kolhapur', vehicleType: 'BIKE' })).toEqual([]);
    });
});
