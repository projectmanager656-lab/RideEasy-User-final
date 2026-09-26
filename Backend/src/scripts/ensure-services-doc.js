/**
 * Create or migrate the singleton `services` document (from legacy `pricings` if needed).
 * Run: npm run migrate:services  (from backend/)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const connectToDb = require('../config/db');
const pricingService = require('../services/pricing.service');

async function main () {
    await connectToDb();
    const doc = await pricingService.ensureServiceDoc();
    console.log('[migrate:services] key:', doc.key, 'rates tiers:', Object.keys(doc.rates || {}));
    await require('mongoose').disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
