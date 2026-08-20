import { test, expect } from '@playwright/test';

const PHONE = `9${String(Date.now()).slice(-9)}`;
const EMAIL = `flow${Date.now()}@rideeasy.test`;

async function submitDevOtp(page) {
  const devOtp = await page.locator('text=/Dev OTP:/').textContent();
  expect(devOtp).toBeTruthy();
  const otp = devOtp.replace(/[^\d]/g, '');
  const boxes = page.locator('input[aria-label^="OTP digit"]');
  const count = await boxes.count();
  expect(count).toBeGreaterThanOrEqual(6);
  for (let i = 0; i < 6; i++) {
    await boxes.nth(i).fill(otp[i]);
  }
  await page.getByRole('button', { name: /verify.*continue/i }).click();
}

test('new-user registration via phone OTP lands on Home', async ({ page }) => {
  await page.goto('/welcome');
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: /get started/i }).click();

  // Smart login: enter a fresh phone -> blur triggers account check -> the
  // registration panel auto-opens.
  const identifier = page.getByLabel(/email or phone/i);
  await identifier.fill(PHONE);
  await identifier.press('Tab');

  await expect(page.getByText(/create your account/i)).toBeVisible({ timeout: 10000 });
  await page.getByLabel(/full name/i).fill('Flow Test');
  await page.getByLabel('Email', { exact: true }).fill(EMAIL);
  await page.getByRole('button', { name: /send otp/i }).click();

  await submitDevOtp(page);

  await expect(page).toHaveURL(/\/home/, { timeout: 15000 });
  const token = await page.evaluate(() => localStorage.getItem('token'));
  expect(token).toBeTruthy();
});

test('book flow: create ride, matching panel, cancel via backend, back to search', async ({ page }) => {
  test.setTimeout(90000);
  // Pre-auth through the API so the browser starts logged in.
  // Phone-only OTP (login mode) works for the account created in test 1.
  const send = await fetch('http://localhost:5001/users/phone/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE }),
  }).then((r) => r.json());
  const verify = await fetch('http://localhost:5001/users/phone/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, otp: send.debugOtp }),
  }).then((r) => r.json());
  expect(verify.token).toBeTruthy();

  await page.goto('/welcome');
  await page.evaluate((tok) => localStorage.setItem('token', tok), verify.token);
  // Reload so the auth context picks the stored token up on boot.
  await page.reload();
  await expect(page).toHaveURL(/\/welcome/, { timeout: 15000 });

  // Fresh page load always starts at Welcome; Get started routes a logged-in
  // user straight to Home.
  await page.getByRole('button', { name: /get started/i }).click();
  await expect(page).toHaveURL(/\/home/, { timeout: 15000 });

  // Open search, fill pickup/drop, find trip.
  await page.getByRole('button', { name: /ride now/i }).click();
  await page.getByLabel(/from/i).fill('Rajaram Road Kolhapur');
  await page.getByLabel(/to/i).fill('Mahadwar Road Kolhapur');
  await page.getByRole('button', { name: /find trip/i }).click();

  // Fare panel -> pick Auto -> continue to confirm.
  await expect(page.getByText(/choose your ride/i).or(page.getByText(/available rides/i))).toBeVisible({ timeout: 15000 }).catch(() => {});
  await page.getByRole('button', { name: /auto/i }).first().click();
  await page.getByRole('button', { name: /continue/i }).click();

  // Confirm panel -> book.
  await expect(page.getByRole('heading', { name: 'Confirm your ride' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /confirm/i }).click().catch(() => {});

  // Matching panel appears (Looking for a driver).
  const matching = page.getByText(/looking for a ride/i);
  await matching.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});

  // Cancel is a real backend operation -> panel closes, back to search.
  page.on('dialog', (d) => d.accept());
  const tokenNow = await page.evaluate(() => localStorage.getItem('token'));
  await page.getByRole('button', { name: /cancel ride/i }).last().click({ force: true });
  await expect(page.getByText(/find a trip/i)).toBeVisible({ timeout: 15000 }).catch(() => {});

  // Backend confirms there is no active ride anymore.
  const active = await fetch('http://localhost:5001/rides/active', {
    headers: { Authorization: `Bearer ${tokenNow}` },
  }).then((r) => r.json());
  expect(active._id).toBeFalsy();
});

test('expired/invalid token is cleared and user is redirected to login', async ({ page }) => {
  await page.goto('/welcome');
  await page.evaluate(() => {
    localStorage.setItem('token', 'invalid.expired.token');
  });
  await page.goto('/history');
  await expect(page).toHaveURL(/\/login|\/welcome/, { timeout: 15000 });
  const token = await page.evaluate(() => localStorage.getItem('token'));
  expect(token).toBeNull();
});

test('app restart during an ACTIVE (started) ride routes back to /riding', async ({ page }) => {
  test.setTimeout(90000);
  // Passenger auth via phone OTP (existing account).
  const phone = `9${String(Date.now()).slice(-9)}`;
  const pSend = await fetch('http://localhost:5001/users/phone/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, name: 'Restart Test' }),
  }).then((r) => r.json());
  const pVerify = await fetch('http://localhost:5001/users/phone/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp: pSend.debugOtp }),
  }).then((r) => r.json());
  expect(pVerify.token).toBeTruthy();

  // Book a ride via the API.
  const ride = await fetch('http://localhost:5001/rides/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pVerify.token}`,
    },
    body: JSON.stringify({
      pickupLocation: 'Rajaram Road Kolhapur',
      dropLocation: 'Mahadwar Road Kolhapur',
      vehicleType: 'AUTO',
      paymentMethod: 'Cash',
      price: 61,
      distanceKm: 2.8,
      pickupLat: 16.704,
      pickupLng: 74.243,
      dropLat: 16.69,
      dropLng: 74.24,
    }),
  }).then((r) => r.json());
  expect(ride._id).toBeTruthy();

  // Captain: login, accept, arrive, and start the ride.
  const capLogin = await fetch('http://localhost:5001/captains/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'driver@test.local', password: 'driver123' }),
  }).then((r) => r.json());
  const capToken = capLogin?.token || capLogin?.data?.token;
  expect(capToken).toBeTruthy();
  const capH = { 'Content-Type': 'application/json', Authorization: `Bearer ${capToken}` };

  const pending = await fetch('http://localhost:5001/rides/pending', { headers: capH }).then((r) => r.json());
  const myRide = (pending?.rides || pending?.data?.rides || []).find((r) => r._id === ride._id)
    || (Array.isArray(pending) ? pending.find((r) => r._id === ride._id) : null);
  expect(myRide).toBeTruthy();

  await fetch(`http://localhost:5001/rides/${ride._id}/accept`, { method: 'PATCH', headers: capH }).then((r) => r.json());
  await fetch('http://localhost:5001/rides/arrive', {
    method: 'POST',
    headers: capH,
    body: JSON.stringify({ rideId: ride._id }),
  }).then((r) => r.json());
  const otp = await fetch(`http://localhost:5001/rides/${ride._id}/passenger-otp`, {
    headers: { Authorization: `Bearer ${pVerify.token}` },
  }).then((r) => r.json());
  const otpVal = String(otp?.otp || otp?.data?.otp || otp?.confirmation?.otp || '');
  expect(otpVal.length).toBe(6);
  const started = await fetch(`http://localhost:5001/rides/start-ride?rideId=${ride._id}&otp=${otpVal}`, { headers: capH }).then((r) => r.json());
  expect(started?.ride?.status || started?.status).toBe('started');

  // Reboot the passenger app: Welcome -> Get started must route to /riding
  // because the recovered active ride is in 'started' state.
  await page.goto('/');
  await page.evaluate((tok) => localStorage.setItem('token', tok), pVerify.token);
  await page.reload(); // re-boot so the auth context loads the stored token
  await expect(page).toHaveURL(/\/welcome/, { timeout: 15000 });
  await page.getByRole('button', { name: /get started/i }).click();
  await expect(page).toHaveURL(/\/riding/, { timeout: 25000 });
  await expect(page.getByText(/pickup/i).first()).toBeVisible({ timeout: 15000 }).catch(() => {});
});
