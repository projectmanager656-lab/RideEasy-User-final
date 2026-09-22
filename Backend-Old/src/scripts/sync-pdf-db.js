const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');

dotenv.config();

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
    throw new Error('MONGO_URI is missing from .env');
}

const DB_NAME = 'rideeasy';

/**
 * Collections required by the PDF/project structure.
 *
 * Existing collections are NEVER dropped.
 * New collections are created only when missing.
 */
const REQUIRED_COLLECTIONS = [
    'users',
    'drivers',
    'vehicles',
    'rides',
    'rideRequests',
    'payments',
    'reviews',
    'driverlocations',
    'notifications',
    'supportTickets',
    'documents',
    'auditLogs',
    'pricingRules',
    'serviceAreas',

    // Existing project collections
    'admins',
    'blacklisttokens',
    'services',
    'pricings',
    'subscriptions',
];

/**
 * Create collections only when they don't already exist.
 */
async function ensureCollections(db) {
    console.log('\n========== ENSURING COLLECTIONS ==========\n');

    const existing = await db.listCollections().toArray();
    const existingNames = new Set(existing.map((c) => c.name));

    for (const collectionName of REQUIRED_COLLECTIONS) {
        if (existingNames.has(collectionName)) {
            console.log(`[KEEP]   collection: ${collectionName}`);
        } else {
            await db.createCollection(collectionName);
            console.log(`[CREATE] collection: ${collectionName}`);
        }
    }
}

/**
 * Compare MongoDB index key definitions.
 *
 * Example:
 *
 * Existing:
 * { status: 1, createdAt: -1 }
 *
 * Requested:
 * { status: 1, createdAt: -1 }
 *
 * These are considered the same even if their names differ.
 */
function sameIndexKeys(existingKeys, requestedKeys) {
    const existingEntries = Object.entries(existingKeys);
    const requestedEntries = Object.entries(requestedKeys);

    if (existingEntries.length !== requestedEntries.length) {
        return false;
    }

    return requestedEntries.every(([key, value]) => {
        return existingKeys[key] === value;
    });
}

/**
 * Safely create an index.
 *
 * IMPORTANT:
 * We first check whether an equivalent index already exists.
 * Therefore an existing index with a different name will NOT cause
 * IndexOptionsConflict.
 *
 * Existing indexes are never renamed or deleted.
 */
async function ensureIndex(db, collectionName, keys, options = {}) {
    const collection = db.collection(collectionName);

    const existingIndexes = await collection.indexes();

    const existing = existingIndexes.find((index) =>
        sameIndexKeys(index.key, keys)
    );

    if (existing) {
        console.log(
            `[KEEP]   index: ${collectionName}.${existing.name}`
        );

        return existing.name;
    }

    const createdName = await collection.createIndex(keys, options);

    console.log(
        `[CREATE] index: ${collectionName}.${createdName}`
    );

    return createdName;
}

/**
 * Ensure indexes required by the PDF/project structure.
 */
async function ensureIndexes(db) {
    console.log('\n========== CREATING / VERIFYING INDEXES ==========\n');

    // =========================================================
    // USERS
    // =========================================================

    await ensureIndex(
        db,
        'users',
        { phone: 1 },
        {
            unique: true,
            sparse: true,
            name: 'phone_1_pdf',
        }
    );

    // =========================================================
    // DRIVERS
    // =========================================================

    await ensureIndex(
        db,
        'drivers',
        { userId: 1 },
        {
            unique: true,
            sparse: true,
            name: 'userId_1_pdf',
        }
    );

    // =========================================================
    // VEHICLES
    // =========================================================

    await ensureIndex(
        db,
        'vehicles',
        { driverId: 1 },
        {
            name: 'driverId_1_pdf',
        }
    );

    // =========================================================
    // RIDES
    // =========================================================

    await ensureIndex(
        db,
        'rides',
        { userId: 1, createdAt: -1 },
        {
            name: 'userId_1_createdAt_-1_pdf',
        }
    );

    await ensureIndex(
        db,
        'rides',
        { driverId: 1, createdAt: -1 },
        {
            name: 'driverId_1_createdAt_-1_pdf',
        }
    );

    await ensureIndex(
        db,
        'rides',
        { status: 1, createdAt: -1 },
        {
            name: 'status_1_createdAt_-1_pdf',
        }
    );

    // =========================================================
    // RIDE REQUESTS
    // =========================================================

    await ensureIndex(
        db,
        'rideRequests',
        { pickup: '2dsphere' },
        {
            name: 'pickup_2dsphere_pdf',
        }
    );

    await ensureIndex(
        db,
        'rideRequests',
        { expiresAt: 1 },
        {
            expireAfterSeconds: 0,
            sparse: true,
            name: 'expiresAt_1_ttl_pdf',
        }
    );

    // =========================================================
    // DRIVER LOCATIONS
    // =========================================================

    await ensureIndex(
        db,
        'driverlocations',
        { location: '2dsphere' },
        {
            sparse: true,
            name: 'location_2dsphere_pdf',
        }
    );

    await ensureIndex(
        db,
        'driverlocations',
        { driverId: 1 },
        {
            name: 'driverId_1_pdf',
        }
    );

    // =========================================================
    // PAYMENTS
    // =========================================================

    await ensureIndex(
        db,
        'payments',
        { rideId: 1 },
        {
            name: 'rideId_1_pdf',
        }
    );

    // =========================================================
    // REVIEWS
    // =========================================================

    await ensureIndex(
        db,
        'reviews',
        { toUserId: 1, createdAt: -1 },
        {
            name: 'toUserId_1_createdAt_-1_pdf',
        }
    );

    await ensureIndex(
        db,
        'reviews',
        { rideId: 1 },
        {
            name: 'rideId_1_pdf',
        }
    );

    // =========================================================
    // NOTIFICATIONS
    // =========================================================

    await ensureIndex(
        db,
        'notifications',
        { userId: 1, read: 1, createdAt: -1 },
        {
            name: 'userId_1_read_1_createdAt_-1_pdf',
        }
    );

    // =========================================================
    // SUPPORT TICKETS
    // =========================================================

    await ensureIndex(
        db,
        'supportTickets',
        { userId: 1, createdAt: -1 },
        {
            name: 'userId_1_createdAt_-1_pdf',
        }
    );

    // =========================================================
    // DOCUMENTS
    // =========================================================

    await ensureIndex(
        db,
        'documents',
        { driverId: 1 },
        {
            name: 'driverId_1_pdf',
        }
    );

    // =========================================================
    // AUDIT LOGS
    // =========================================================

    await ensureIndex(
        db,
        'auditLogs',
        { actorId: 1, createdAt: -1 },
        {
            name: 'actorId_1_createdAt_-1_pdf',
        }
    );

    await ensureIndex(
        db,
        'auditLogs',
        { entityType: 1, entityId: 1, createdAt: -1 },
        {
            name: 'entityType_1_entityId_1_createdAt_-1_pdf',
        }
    );

    // =========================================================
    // PRICING RULES
    // =========================================================

    await ensureIndex(
        db,
        'pricingRules',
        { vehicleType: 1 },
        {
            name: 'vehicleType_1_pdf',
        }
    );

    // =========================================================
    // SERVICE AREAS
    // =========================================================

    await ensureIndex(
        db,
        'serviceAreas',
        { location: '2dsphere' },
        {
            sparse: true,
            name: 'location_2dsphere_pdf',
        }
    );

    console.log('\n[OK] Index verification complete.');
}

/**
 * Add only the PDF-required common fields to existing users.
 *
 * IMPORTANT:
 * Existing user data is preserved.
 */
async function migrateExistingUsers(db) {
    console.log('\n========== CHECKING EXISTING USERS ==========\n');

    const users = db.collection('users');

    const result = await users.updateMany(
        {},
        {
            $set: {
                role: 'customer',
                status: 'active',
            },
        }
    );

    console.log(
        `[UPDATE] users matched=${result.matchedCount}, modified=${result.modifiedCount}`
    );
}

/**
 * Existing drivers are NOT structurally rewritten.
 *
 * This is intentional because your existing captain/driver schema
 * already contains project-specific fields and there are currently
 * zero driver documents.
 */
async function migrateExistingDrivers(db) {
    console.log('\n========== CHECKING EXISTING DRIVERS ==========\n');

    const drivers = db.collection('drivers');

    const count = await drivers.countDocuments();

    console.log(`[CHECK] drivers documents=${count}`);

    if (count === 0) {
        console.log(
            '[INFO] No existing drivers found. No driver documents created.'
        );
    } else {
        console.log(
            '[INFO] Existing driver documents were NOT structurally rewritten.'
        );
    }
}

/**
 * Print final collection/document counts.
 *
 * This is read-only.
 */
async function printDatabaseSummary(db) {
    console.log('\n========== FINAL DATABASE SUMMARY ==========\n');

    for (const collectionName of REQUIRED_COLLECTIONS) {
        const collection = db.collection(collectionName);

        const count = await collection.countDocuments();

        console.log(
            `${collectionName}: ${count} document${count === 1 ? '' : 's'}`
        );
    }
}

/**
 * Main
 */
async function main() {
    let client;

    try {
        console.log('[MongoDB] Connecting...');

        client = new MongoClient(mongoUri);

        await client.connect();

        const db = client.db(DB_NAME);

        console.log(
            `[MongoDB] Connected database: ${db.databaseName}`
        );

        await ensureCollections(db);

        await migrateExistingUsers(db);

        await migrateExistingDrivers(db);

        await ensureIndexes(db);

        await printDatabaseSummary(db);

        console.log('\n==============================================');
        console.log('[SUCCESS] PDF database synchronization complete.');
        console.log('==============================================\n');
    } catch (error) {
        console.error('\n==============================================');
        console.error('[FAILED]', error);
        console.error('==============================================\n');

        process.exitCode = 1;
    } finally {
        if (client) {
            await client.close();
            console.log('[MongoDB] Connection closed.');
        }
    }
}

main();