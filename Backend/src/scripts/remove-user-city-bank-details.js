/**
 * One-time, idempotent migration for legacy passenger records only.
 * Run: npm run migrate:user-city-bank-details (from Backend/)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectToDb = require('../config/db');

async function main () {
    await connectToDb();
    const result = await mongoose.connection.db.collection('users').updateMany(
        {},
        { $unset: { city: '', bankDetails: '' } },
    );
    console.log('[migrate:user-city-bank-details] users matched:', result.matchedCount, 'modified:', result.modifiedCount);
    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error('[migrate:user-city-bank-details]', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
