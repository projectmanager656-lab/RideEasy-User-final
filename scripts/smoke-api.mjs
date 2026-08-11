#!/usr/bin/env node
/**
 * API smoke test: health → register user + driver (Pune, AUTO) → create ride → driver /rides/pending must list it.
 * Requires: API server running (default http://localhost:5001), MongoDB reachable.
 *
 * Usage:  API_URL=http://127.0.0.1:5001 node scripts/smoke-api.mjs
 */
import process from 'node:process';

const BASE = (process.env.API_URL || 'http://localhost:5001').replace(/\/$/, '');
const pass = process.env.SMOKE_PASSWORD || 'SmokeTest1!';

async function req(method, path, { token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text };
    }
    return { ok: r.ok, status: r.status, data };
}

async function main() {
    console.log('API_URL=', BASE);

    const h = await req('GET', '/health/live');
    if (!h.ok) {
        console.error('FAIL: /health/live', h.status, h.data);
        process.exit(1);
    }
    console.log('OK  /health/live');

    const id = Date.now();
    const userEmail = `smoke_u_${id}@test.local`;
    const capEmail = `smoke_d_${id}@test.local`;
    const phoneU = `9${String(id).padStart(9, '0').slice(-9)}`;
    const phoneD = `8${String(id).padStart(9, '0').slice(-9)}`;

    const userReg = await req('POST', '/users/register', {
        body: {
            name: 'Smoke User',
            phone: phoneU,
            email: userEmail,
            password: pass,
            city: 'Pune',
            bankDetails: {
                accountHolderName: 'Smoke User',
                accountNumber: '123456789012',
                ifscCode: 'HDFC0000001',
                upiId: 'smoke@testupi',
            },
        },
    });
    if (!userReg.ok) {
        console.error('FAIL: POST /users/register', userReg.status, userReg.data);
        process.exit(1);
    }
    const userToken = userReg.data.token;
    if (!userToken) {
        console.error('FAIL: no user token', userReg.data);
        process.exit(1);
    }
    console.log('OK  user registered');

    const capReg = await req('POST', '/captains/register', {
        body: {
            name: 'Smoke Driver',
            phone: phoneD,
            email: capEmail,
            password: pass,
            vehicleType: 'AUTO',
            vehicleNumber: 'MH12SM9999',
            license: 'MH142011006282',
            city: 'Pune',
        },
    });
    if (!capReg.ok) {
        console.error('FAIL: POST /captains/register', capReg.status, capReg.data);
        process.exit(1);
    }
    const capToken = capReg.data.token;
    if (!capToken) {
        console.error('FAIL: no captain token', capReg.data);
        process.exit(1);
    }
    console.log('OK  captain registered');

    const pickup = 'Pune Railway Station';
    const drop = 'Kothrud Pune';
    const fareRes = await req(
        'GET',
        `/rides/get-fare?pickup=${encodeURIComponent(pickup)}&destination=${encodeURIComponent(drop)}`,
        { token: userToken }
    );
    if (!fareRes.ok) {
        console.error('FAIL: GET /rides/get-fare', fareRes.status, fareRes.data);
        process.exit(1);
    }
    const fk = fareRes.data;
    const price = fk.AUTO ?? fk.MINI ?? fk.CAR;
    const distanceKm = fk.distanceKm;
    if (price == null || distanceKm == null) {
        console.error('FAIL: fare missing AUTO price or distanceKm', fk);
        process.exit(1);
    }
    console.log('OK  get-fare AUTO=', price, 'km=', distanceKm);

    const create = await req('POST', '/rides/create', {
        token: userToken,
        body: {
            pickupLocation: pickup,
            dropLocation: drop,
            city: 'Pune',
            vehicleType: 'AUTO',
            paymentMethod: 'Cash',
            price,
            distanceKm,
        },
    });
    if (!create.ok) {
        console.error('FAIL: POST /rides/create', create.status, create.data);
        process.exit(1);
    }
    const rideId = create.data._id;
    console.log('OK  ride created', rideId);

    const pending = await req('GET', '/rides/pending', { token: capToken });
    if (!pending.ok) {
        console.error('FAIL: GET /rides/pending', pending.status, pending.data);
        process.exit(1);
    }
    const list = Array.isArray(pending.data) ? pending.data : [];
    const found = list.some((r) => String(r._id) === String(rideId));
    console.log('OK  pending count=', list.length, found ? '(includes new ride)' : '');
    if (!found) {
        console.error('FAIL: pending list should include the new ride (same Pune + AUTO + active subscription).');
        process.exit(1);
    }

    console.log('\nSMOKE PASSED');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
