/**
 * One-off: create a login-ready driver in MongoDB (dev / QA).
 * Run from repo: cd backend && npm run seed:captain
 *
 * Env (optional): SEED_CAPTAIN_EMAIL, SEED_CAPTAIN_PASSWORD
 * Uses MONGO_URI or MONGODB_URI from backend/.env
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const captainModel = require('../models/captain.model');
const { expiresAfterPlan } = require('../services/subscriptionDriver.service');

const email = (process.env.SEED_CAPTAIN_EMAIL || 'driver@test.local').trim().toLowerCase();
const password = process.env.SEED_CAPTAIN_PASSWORD || 'driver123';

async function main() {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
        console.error('Set MONGO_URI or MONGODB_URI in backend/.env');
        process.exit(1);
    }
    await mongoose.connect(uri);

    const existing = await captainModel.findOne({ email });
    if (existing) {
        console.log('Captain already exists:', email);
        console.log('Use that email + your password on /captain-login, or delete the doc in `drivers` to seed again.');
        await mongoose.disconnect();
        return;
    }

    const hashed = await captainModel.hashPassword(password);
    const started = new Date();

    await captainModel.create({
        name: 'Test Driver',
        phone: '9999999999',
        email,
        password: hashed,
        // This seed represents an already-onboarded driver, not a Stage 1 signup.
        vehicleType: 'AUTO',
        vehicleNumber: 'MH12AB1234',
        license: 'LIC12345',
        servingCity: 'Kolhapur',
        status: 'active',
        approved: true,
        subscriptionStatus: 'active',
        subscriptionPlan: 'monthly',
        subscriptionStartedAt: started,
        subscriptionExpiresAt: expiresAfterPlan('monthly', started),
        location: { type: 'Point', coordinates: [ 73.8567, 18.5204 ] },
    });

    console.log('Created test captain (collection: drivers)');
    console.log('  Email:   ', email);
    console.log('  Password:', password);
    console.log('  Login:   http://localhost:5173/captain-login (or your frontend URL)');

    await mongoose.disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
