/**
 * Create a login-ready passenger/user in MongoDB (dev / QA).
 * Run: cd Backend && node src/scripts/seed-test-user.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const userModel = require('../models/user.model');

const email = (process.env.SEED_USER_EMAIL || 'user@test.local').trim().toLowerCase();
const password = process.env.SEED_USER_PASSWORD || 'user123';
const phone = process.env.SEED_USER_PHONE || '9876543210';
const name = process.env.SEED_USER_NAME || 'Test Passenger';

async function main() {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
        console.error('Set MONGO_URI or MONGODB_URI in Backend/.env');
        process.exit(1);
    }
    await mongoose.connect(uri);

    let user = await userModel.findOne({ $or: [{ email }, { phone }] });
    if (user) {
        console.log('User already exists in MongoDB:', user.email, user.phone);
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            user.password = await userModel.hashPassword(password);
            await user.save();
            console.log('Updated user password to match seed password.');
        }
    } else {
        const hashed = await userModel.hashPassword(password);
        user = await userModel.create({
            name,
            phone,
            email,
            password: hashed,
            referralCode: 'RIDE' + Math.floor(100000 + Math.random() * 900000),
        });
        console.log('Created test user in MongoDB:');
    }

    console.log('-------------------------------------------');
    console.log('  Email:    ', email);
    console.log('  Password: ', password);
    console.log('  Phone:    ', phone);
    console.log('  Login at:  http://localhost:5176/login');
    console.log('-------------------------------------------');

    await mongoose.disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
