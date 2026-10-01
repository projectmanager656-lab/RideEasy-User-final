/**
 * One-time migration: MINI/SEDAN → CAR on drivers and rides; strip legacy driver plan keys from pricing doc.
 * Run: npm run migrate:vehicle-types  (from backend/)
 * Requires MONGO_URI / MONGODB_URI or local default.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectToDb = require('../config/db');
const Pricing = require('../models/pricing.model');
const Service = require('../models/service.model');

async function main() {
    await connectToDb();
    const db = mongoose.connection.db;
    const drivers = db.collection('drivers');
    const rides = db.collection('rides');

    const dRes = await drivers.updateMany(
        { vehicleType: { $in: [ 'MINI', 'SEDAN' ] } },
        { $set: { vehicleType: 'CAR' } },
    );
    const rRes = await rides.updateMany(
        { vehicleType: { $in: [ 'MINI', 'SEDAN' ] } },
        { $set: { vehicleType: 'CAR' } },
    );
    console.log('[migrate] drivers updated:', dRes.modifiedCount, 'matched:', dRes.matchedCount);
    console.log('[migrate] rides updated:', rRes.modifiedCount, 'matched:', rRes.matchedCount);

    async function normalizePricingLikeDocs (Model, label) {
        const docs = await Model.find({}).lean();
        for (const doc of docs) {
            const dp = doc.driverPlans && typeof doc.driverPlans === 'object' ? { ...doc.driverPlans } : {};
            delete dp.MINI;
            delete dp.SEDAN;
            const rates = doc.rates && typeof doc.rates === 'object' ? { ...doc.rates } : {};
            delete rates.MINI;
            delete rates.SEDAN;
            await Model.updateOne(
                { _id: doc._id },
                { $set: { driverPlans: dp, rates } },
            );
        }
        console.log(`[migrate] ${label} docs normalized:`, docs.length);
    }
    await normalizePricingLikeDocs(Service, 'services');
    await normalizePricingLikeDocs(Pricing, 'pricings (legacy)');

    await mongoose.disconnect();
    console.log('[migrate] done');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
