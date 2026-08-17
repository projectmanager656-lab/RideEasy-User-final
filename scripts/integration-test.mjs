#!/usr/bin/env node
/**
 * Integration test: login → profile → ride history → support ticket flow → admin flow.
 * Uses existing safe test credentials from temp files.
 */
import process from 'node:process';

const BASE = (process.env.API_URL || 'http://127.0.0.1:5001').replace(/\/$/, '');
const results = [];

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

function record(name, ok, detail = '') {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
}

async function main() {
    console.log('API_URL=', BASE);

    // 1. User login with existing test credentials
    const userLogin = await req('POST', '/users/login', {
        body: { email: 'temp-test-user@example.com', password: 'TempTest123!' },
    });
    record('POST /users/login', userLogin.ok, userLogin.ok ? `status=${userLogin.status}` : JSON.stringify(userLogin.data));
    if (!userLogin.ok) {
        console.log('\nINTEGRATION TEST FAILED (user login)');
        process.exit(1);
    }
    const userToken = userLogin.data.token || userLogin.data.data?.token;

    // 2. User profile
    const userProfile = await req('GET', '/users/profile', { token: userToken });
    record('GET /users/profile', userProfile.ok, userProfile.ok ? `status=${userProfile.status}` : JSON.stringify(userProfile.data));

    // 3. User ride history
    const rideHistory = await req('GET', '/users/ride-history', { token: userToken });
    record('GET /users/ride-history', rideHistory.ok, rideHistory.ok ? `status=${rideHistory.status}` : JSON.stringify(rideHistory.data));

    // 4. Support ticket - create (as user)
    const ticketCreate = await req('POST', '/support-tickets', {
        token: userToken,
        body: {
            category: 'other',
            subject: 'Integration test ticket',
            description: 'Integration test support ticket created during testing phase.',
        },
    });
    record('POST /support-tickets (create)', ticketCreate.ok, ticketCreate.ok ? `status=${ticketCreate.status}` : JSON.stringify(ticketCreate.data));
    const ticketId = ticketCreate.data?.ticket?._id || ticketCreate.data?._id || ticketCreate.data?.data?._id;

    // 5. Support ticket - list own tickets
    const ticketList = await req('GET', '/support-tickets', { token: userToken });
    record('GET /support-tickets (list own)', ticketList.ok, ticketList.ok ? `status=${ticketList.status}` : JSON.stringify(ticketList.data));

    // 6. Support ticket - get by id
    if (ticketId) {
        const ticketGet = await req('GET', `/support-tickets/${ticketId}`, { token: userToken });
        record('GET /support-tickets/:id', ticketGet.ok, ticketGet.ok ? `status=${ticketGet.status}` : JSON.stringify(ticketGet.data));
    }

    // 7. User logout
    const userLogout = await req('GET', '/users/logout', { token: userToken });
    record('GET /users/logout', userLogout.ok, userLogout.ok ? `status=${userLogout.status}` : JSON.stringify(userLogout.data));

    // 8. Admin login
    const adminLogin = await req('POST', '/admin/login', {
        body: { email: 'sm@gmail.com', password: '123456' },
    });
    record('POST /admin/login', adminLogin.ok, adminLogin.ok ? `status=${adminLogin.status}` : JSON.stringify(adminLogin.data));
    const adminToken = adminLogin.data?.token || adminLogin.data?.data?.token;

    if (adminToken) {
        // 9. Admin - list all support tickets
        const adminTickets = await req('GET', '/support-tickets/admin', { token: adminToken });
        record('GET /support-tickets/admin', adminTickets.ok, adminTickets.ok ? `status=${adminTickets.status}` : JSON.stringify(adminTickets.data));

        // 10. Admin - get ticket by id
        if (ticketId) {
            const adminTicketGet = await req('GET', `/support-tickets/admin/${ticketId}`, { token: adminToken });
            record('GET /support-tickets/admin/:id', adminTicketGet.ok, adminTicketGet.ok ? `status=${adminTicketGet.status}` : JSON.stringify(adminTicketGet.data));
        }
    }

    // 11. Captain login - try to find a captain from smoke test
    // We'll use the smoke test captain credentials pattern - but we don't know the exact email
    // Instead, let's try to register a new captain and test captain flows
    const id = Date.now();
    const capEmail = `itest_d_${id}@test.local`;
    const phoneD = `7${String(id).padStart(9, '0').slice(-9)}`;
    const capReg = await req('POST', '/captains/register', {
        body: {
            name: 'Integration Test Driver',
            phone: phoneD,
            email: capEmail,
            password: 'SmokeTest1!',
            vehicleType: 'AUTO',
            vehicleNumber: 'MH12IT9999',
            license: 'MH142011006282',
            city: 'Kolhapur',
        },
    });
    record('POST /captains/register', capReg.ok, capReg.ok ? `status=${capReg.status}` : JSON.stringify(capReg.data));
    const capToken = capReg.data?.token || capReg.data?.data?.token;

    if (capToken) {
        // 12. Captain profile
        const capProfile = await req('GET', '/captains/profile', { token: capToken });
        record('GET /captains/profile', capProfile.ok, capProfile.ok ? `status=${capProfile.status}` : JSON.stringify(capProfile.data));

        // 13. Captain ride history
        const capRideHistory = await req('GET', '/captains/rides/history', { token: capToken });
        record('GET /captains/rides/history', capRideHistory.ok, capRideHistory.ok ? `status=${capRideHistory.status}` : JSON.stringify(capRideHistory.data));

        // 14. Captain earnings
        const capEarnings = await req('GET', '/captains/earnings', { token: capToken });
        record('GET /captains/earnings', capEarnings.ok, capEarnings.ok ? `status=${capEarnings.status}` : JSON.stringify(capEarnings.data));

        // 15. Captain status update
        const capStatus = await req('POST', '/captains/status', {
            token: capToken,
            body: { status: 'active' },
        });
        record('POST /captains/status', capStatus.ok, capStatus.ok ? `status=${capStatus.status}` : JSON.stringify(capStatus.data));

        // 16. Captain logout
        const capLogout = await req('GET', '/captains/logout', { token: capToken });
        record('GET /captains/logout', capLogout.ok, capLogout.ok ? `status=${capLogout.status}` : JSON.stringify(capLogout.data));
    }

    // 17. Config endpoint
    const config = await req('GET', '/config/service-areas');
    record('GET /config/service-areas', config.ok, config.ok ? `status=${config.status}` : JSON.stringify(config.data));

    // 18. 404 handling
    const notFound = await req('GET', '/nonexistent-route');
    record('GET /nonexistent-route (404)', notFound.status === 404, `status=${notFound.status}`);

    // Summary
    const passed = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    console.log(`\nINTEGRATION TEST SUMMARY: ${passed} passed, ${failed} failed, ${results.length} total`);
    if (failed > 0) {
        console.log('\nFailed tests:');
        results.filter(r => !r.ok).forEach(r => console.log(`  - ${r.name}: ${r.detail}`));
        process.exit(1);
    }
    console.log('\nINTEGRATION TEST PASSED');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});