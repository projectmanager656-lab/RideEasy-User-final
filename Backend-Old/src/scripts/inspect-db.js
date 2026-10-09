/**
 * Read-only DB inspection script for audit purposes.
 * Run: node Backend/src/scripts/inspect-db.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');

async function main() {
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rideeasy';
    await mongoose.connect(uri);
    const db = mongoose.connection.db;

    console.log('=== COLLECTIONS & COUNTS ===');
    const cols = await db.listCollections().toArray();
    for (const c of cols) {
        const count = await db.collection(c.name).countDocuments();
        console.log(`${c.name}: ${count} docs`);
    }

    console.log('\n=== USERS (non-sensitive) ===');
    const users = await db.collection('users').find({}, {
        projection: { password: 0, loginOtp: 0, loginOtpExpiresAt: 0, bankDetails: 0 }
    }).toArray();
    console.log(JSON.stringify(users, null, 2));

    console.log('\n=== ADMINS (non-sensitive) ===');
    const admins = await db.collection('admins').find({}, {
        projection: { password: 0 }
    }).toArray();
    console.log(JSON.stringify(admins, null, 2));

    console.log('\n=== SUPPORT TICKETS ===');
    const tickets = await db.collection('supportTickets').find({}).toArray();
    console.log(JSON.stringify(tickets, null, 2));

    console.log('\n=== INDEXES ===');
    for (const c of cols) {
        const idx = await db.collection(c.name).indexes();
        if (idx.length > 0) {
            console.log(`\n-- ${c.name} --`);
            idx.forEach(i => console.log(`  ${i.name}: ${JSON.stringify(i.key)}` + (i.unique ? ' [unique]' : '') + (i.expireAfterSeconds ? ` [TTL ${i.expireAfterSeconds}s]` : '')));
        }
    }

    await mongoose.disconnect();
    console.log('\n=== DONE ===');
}

main().catch((err) => {
    console.error('Inspect failed:', err.message);
    process.exit(1);
});
