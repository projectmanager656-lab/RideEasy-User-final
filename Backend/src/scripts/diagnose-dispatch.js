#!/usr/bin/env node
/**
 * DEV-ONLY, READ-ONLY dispatch diagnostic for RideEasy.
 *
 * Answers "why did my ride reach nobody?" without changing any data: dumps the ride,
 * every driver candidate's eligibility verdict (online / subscription / wallet / city /
 * vehicle / distance / location age), the durable dispatch attempts recorded per
 * (ride, captain), and whether `/rides/pending` would return the ride to a driver.
 *
 * Usage (from Backend/):
 *   npm run diagnose:dispatch -- --ride <rideId>
 *   npm run diagnose:dispatch -- --user <userId|email>
 *   npm run diagnose:dispatch -- --compare <rideIdA> <rideIdB>
 *   npm run diagnose:dispatch -- --captain <id|phone|email> [--pickup lat,lng]
 *   npm run diagnose:dispatch -- --recent [n]
 *
 * Never prints tokens, passwords or full driver documents — ids are masked; only the
 * database HOST (no credentials) is shown.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectToDb = require('../config/db');
const rideModel = require('../models/rideCore.model');
const captainModel = require('../models/captain.model');
const userModel = require('../models/user.model');
const RideDispatch = require('../models/rideDispatch.model');
const { getCaptainPricing } = require('../services/pricing.service');
const { captainVehicleTypesForRide } = require('../services/rideCore.service');
const { cityKey, haversineKm, ridePickupInServiceArea } = require('../utils/serviceArea');

const RIDE_SEARCH_RADIUS_M = Number(process.env.RIDE_SEARCH_RADIUS_M || 5000);
const PENDING_RIDE_MAX_AGE_MIN = Number(process.env.PENDING_RIDE_MAX_AGE_MIN || 45);

const mask = (id) => (id == null ? '-' : String(id).slice(-6));
const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v || ''));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--ride') opts.ride = argv[++i];
    else if (a === '--user') opts.user = argv[++i];
    else if (a === '--captain') opts.captain = argv[++i];
    else if (a === '--pickup') opts.pickup = argv[++i];
    else if (a === '--compare') opts.compare = [ argv[++i], argv[++i] ];
    else if (a === '--recent') {
      const next = argv[i + 1];
      if (next && !String(next).startsWith('--')) { opts.recent = Number(next); i += 1; }
      else opts.recent = 5;
    } else opts._.push(a);
  }
  return opts;
}

function pickupOf(ride) {
  const c = ride?.pickup?.coordinates;
  if (!Array.isArray(c) || c.length < 2) return { lng: null, lat: null };
  return { lng: num(c[0]), lat: num(c[1]) };
}

function rideSummary(ride) {
  const p = pickupOf(ride);
  return {
    rideId: String(ride._id),
    userId: mask(ride.user?._id || ride.user),
    status: ride.status,
    city: ride.city || null,
    vehicleType: ride.vehicleType || null,
    pickup: `${ride.pickupLocation || '?'}`.slice(0, 48),
    drop: `${ride.dropLocation || '?'}`.slice(0, 48),
    pickupLat: p.lat,
    pickupLng: p.lng,
    price: ride.price ?? null,
    paymentMethod: ride.paymentMethod ?? null,
    searchStartedAt: ride.searchStartedAt || null,
    createdAt: ride.createdAt || null,
    searchAgeMin: ride.searchStartedAt || ride.createdAt
      ? Math.round((Date.now() - new Date(ride.searchStartedAt || ride.createdAt).getTime()) / 60000)
      : null,
    pickupInServiceArea: ridePickupInServiceArea(ride),
  };
}

function driverVerdict(d, ctx) {
  const { rideCityKey, rideVehicleCompat, minWallet, pickupLat, pickupLng } = ctx;
  const driverCityKey = cityKey(d.servingCity);
  const sameCity = Boolean(driverCityKey && rideCityKey && driverCityKey === rideCityKey);
  const driverVehicle = String(d.vehicleType || '').trim().toUpperCase();
  const vehicleOk = rideVehicleCompat.includes(driverVehicle);
  const reasons = [];
  if (!d.approved) reasons.push('not approved');
  if (d.blocked) reasons.push('blocked');
  if (d.subscriptionStatus !== 'active') reasons.push(`subscription ${d.subscriptionStatus || 'none'}`);
  else if (d.subscriptionExpiresAt && new Date(d.subscriptionExpiresAt) <= new Date()) reasons.push('subscription expired');
  if (d.status !== 'active') reasons.push(`status ${d.status || 'inactive'}`);
  if (d.isOnline === false) reasons.push('offline');
  if (Number(d.walletBalance || 0) < minWallet) reasons.push(`wallet ${Number(d.walletBalance || 0)} < ${minWallet}`);
  if (!sameCity) reasons.push(`city '${d.servingCity || '?'}' != '${d._rideCity || ''}'`);
  if (!vehicleOk) reasons.push(`vehicle ${driverVehicle || '?'} not in [${rideVehicleCompat.join(',')}]`);

  const coords = d.location?.coordinates;
  const dLng = Array.isArray(coords) ? num(coords[0]) : null;
  const dLat = Array.isArray(coords) ? num(coords[1]) : null;
  const hasLocation =
    dLat != null && dLng != null && !(Math.abs(dLat) < 0.02 && Math.abs(dLng) < 0.02);
  const distanceM =
    pickupLat != null && pickupLng != null && hasLocation
      ? Math.round(haversineKm(pickupLat, pickupLng, dLat, dLng) * 1000)
      : null;
  const locationAgeMin = d.lastLocationUpdatedAt
    ? Math.round((Date.now() - new Date(d.lastLocationUpdatedAt).getTime()) / 60000)
    : null;
  const verdict = reasons.length
    ? 'EXCLUDED'
    : distanceM != null && distanceM <= RIDE_SEARCH_RADIUS_M
      ? 'ELIGIBLE_NEARBY'
      : 'ELIGIBLE_CITY';
  return { sameCity, vehicleOk, reasons, verdict, driverVehicle, distanceM, hasLocation, locationAgeMin, dLat, dLng };
}

function pendingEligibility(ride, cap, ctx) {
  const reasons = [];
  const capId = String(cap._id);
  if (!cap.approved) reasons.push('not approved');
  if (cap.blocked) reasons.push('blocked');
  if (cap.subscriptionStatus !== 'active') reasons.push('subscription not active');
  if (cap.status !== 'active') reasons.push(`status ${cap.status}`);
  if (cap.isOnline === false) reasons.push('offline');
  if (Number(cap.walletBalance || 0) < ctx.minWallet) reasons.push('wallet below minimum');
  if (!cap.servingCity || !cap.vehicleType) reasons.push('no servingCity/vehicleType');
  if (cap.busy) reasons.push('busy (on an active ride)');
  if (ride.status !== 'searching') reasons.push(`ride status ${ride.status}`);
  if (String(ride.captain || '')) reasons.push('ride already assigned');
  if (ride.declinedBy && ride.declinedBy.map(String).includes(capId)) reasons.push('driver declined this ride');
  if (cityKey(ride.city) !== cityKey(cap.servingCity)) reasons.push('city mismatch');
  if (!captainVehicleTypesForRide(cap.vehicleType).includes(String(ride.vehicleType || '').trim().toUpperCase())) {
    reasons.push('vehicle mismatch');
  }
  const ageBase = ride.searchStartedAt || ride.createdAt;
  if (ageBase && new Date(ageBase).getTime() < Date.now() - PENDING_RIDE_MAX_AGE_MIN * 60000) {
    reasons.push(`older than ${PENDING_RIDE_MAX_AGE_MIN}min`);
  }
  if (!ridePickupInServiceArea(ride)) reasons.push('pickup outside service area');
  return { eligible: reasons.length === 0, reasons };
}

async function buildContext(ride) {
  const { minimumWalletBalance } = await getCaptainPricing();
  return {
    minWallet: Number(minimumWalletBalance || 0),
    rideCityKey: cityKey(ride.city),
    rideVehicleCompat: captainVehicleTypesForRide(ride.vehicleType),
    pickupLat: pickupOf(ride).lat,
    pickupLng: pickupOf(ride).lng,
  };
}

async function candidateRows(ride) {
  const ctx = await buildContext(ride);
  const captains = await captainModel
    .find({})
    .sort({ isOnline: -1, _id: 1 })
    .limit(100)
    .select('vehicleType servingCity status isOnline blocked approved subscriptionStatus subscriptionExpiresAt walletBalance socketId location lastLocationUpdatedAt busy')
    .lean();
  return captains.map((cap) => {
    cap._rideCity = ride.city;
    const v = driverVerdict(cap, ctx);
    const pending = pendingEligibility(ride, cap, ctx);
    return {
      driver: mask(cap._id),
      city: cap.servingCity || '-',
      vehicle: cap.vehicleType || '-',
      online: cap.isOnline ?? null,
      status: cap.status || '-',
      busy: Boolean(cap.busy),
      sub: cap.subscriptionStatus || '-',
      wallet: Number(cap.walletBalance || 0),
      approved: Boolean(cap.approved),
      driverLat: v.dLat ?? null,
      driverLng: v.dLng ?? null,
      locAgeMin: v.locationAgeMin,
      distanceM: v.distanceM,
      inRadius: v.distanceM != null ? v.distanceM <= RIDE_SEARCH_RADIUS_M : null,
      verdict: v.verdict,
      why: v.reasons.length ? v.reasons.join('; ') : '',
      pending: pending.eligible ? 'YES' : `NO (${pending.reasons.join('; ')})`,
    };
  });
}

async function dispatchRows(rideId) {
  const rows = await RideDispatch.find({ rideId }).lean();
  return rows.map((r) => ({
    driver: mask(r.captainId),
    status: r.status,
    socketConnected: Boolean(r.socketConnected),
    room: r.socketRoom || '-',
    failure: r.failureReason || '-',
    attemptedAt: r.dispatchAttemptedAt || null,
    acknowledgedAt: r.acknowledgedAt || null,
  }));
}

async function reportRide(ride) {
  console.log('\n=== RIDE ===');
  console.table([ rideSummary(ride) ]);
  console.log('matching radius (m):', RIDE_SEARCH_RADIUS_M);
  const rows = await candidateRows(ride);
  const counts = rows.reduce(
    (acc, r) => { acc[r.verdict] = (acc[r.verdict] || 0) + 1; return acc; },
    {},
  );
  console.log('candidate verdicts:', counts);
  console.log('=== DRIVER CANDIDATES (unfiltered pool, max 100) ===');
  console.table(rows);
  console.log('=== DISPATCH ATTEMPTS (ride_dispatches) ===');
  const attempts = await dispatchRows(ride._id);
  if (attempts.length) console.table(attempts);
  else console.log('(none recorded — dispatch likely found zero eligible drivers)');
}

async function resolveRide(id) {
  if (!isObjectId(id)) throw new Error(`Not an ObjectId: ${id}`);
  const ride = await rideModel.findById(id).populate('user', 'name email').lean();
  if (!ride) throw new Error(`Ride not found: ${id}`);
  return ride;
}

async function resolveUser(idOrEmail) {
  if (isObjectId(idOrEmail)) return userModel.findById(idOrEmail).lean();
  const email = String(idOrEmail || '').trim().toLowerCase();
  return userModel.findOne({ email }).lean();
}

async function resolveCaptain(idOrPhoneOrEmail) {
  if (isObjectId(idOrPhoneOrEmail)) return captainModel.findById(idOrPhoneOrEmail).lean();
  const q = String(idOrPhoneOrEmail || '').trim();
  return (
    (await captainModel.findOne({ phone: q }).lean()) ||
    (await captainModel.findOne({ email: q.toLowerCase() }).lean())
  );
}

async function runRide(id) {
  const ride = await rideModel.findById(id).populate('user', 'name email').lean();
  if (!ride) throw new Error(`Ride not found: ${id}`);
  console.log('[diagnose] db host:', mongoose.connection.host, '| db name:', mongoose.connection.name);
  await reportRide(ride);
}

async function runUser(idOrEmail) {
  const user = await resolveUser(idOrEmail);
  if (!user) throw new Error(`User not found: ${idOrEmail}`);
  console.log('[diagnose] db host:', mongoose.connection.host, '| db name:', mongoose.connection.name);
  console.log(`[diagnose] user ${mask(user._id)} (${user.email})`);
  const rides = await rideModel
    .find({ user: user._id })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('user', 'name email')
    .lean();
  if (!rides.length) return console.log('(no rides)');
  for (const ride of rides) {
    await reportRide(ride);
  }
}

async function runRecent(n) {
  console.log('[diagnose] db host:', mongoose.connection.host, '| db name:', mongoose.connection.name);
  const rides = await rideModel
    .find({})
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(20, n || 5)))
    .populate('user', 'name email')
    .lean();
  console.table(rides.map(rideSummary));
}

async function runCompare(idA, idB) {
  console.log('[diagnose] db host:', mongoose.connection.host, '| db name:', mongoose.connection.name);
  const [a, b] = await Promise.all([ resolveRide(idA), resolveRide(idB) ]);
  const [sa, sb] = [ rideSummary(a), rideSummary(b) ];
  const [ra, rb] = await Promise.all([ candidateRows(a), candidateRows(b) ]);
  const delivered = (rows) => rows.filter((r) => r.status === 'delivered' || r.status === 'acknowledged').length;
  const attemptsA = await dispatchRows(a._id);
  const attemptsB = await dispatchRows(b._id);
  const eligibleA = ra.filter((r) => r.verdict !== 'EXCLUDED').length;
  const eligibleB = rb.filter((r) => r.verdict !== 'EXCLUDED').length;
  const nearbyA = ra.filter((r) => r.verdict === 'ELIGIBLE_NEARBY').length;
  const nearbyB = rb.filter((r) => r.verdict === 'ELIGIBLE_NEARBY').length;
  const pendingA = ra.filter((r) => r.pending === 'YES').length;
  const pendingB = rb.filter((r) => r.pending === 'YES').length;
  console.log('\n=== COMPARE: A vs B ===');
  console.table([
    { field: 'rideId', A: sa.rideId, B: sb.rideId },
    { field: 'status', A: sa.status, B: sb.status },
    { field: 'city', A: sa.city, B: sb.city },
    { field: 'vehicleType', A: sa.vehicleType, B: sb.vehicleType },
    { field: 'pickupLat', A: sa.pickupLat, B: sb.pickupLat },
    { field: 'pickupLng', A: sa.pickupLng, B: sb.pickupLng },
    { field: 'searchAgeMin', A: sa.searchAgeMin, B: sb.searchAgeMin },
    { field: 'pickupInServiceArea', A: sa.pickupInServiceArea, B: sb.pickupInServiceArea },
    { field: 'radiusM', A: RIDE_SEARCH_RADIUS_M, B: RIDE_SEARCH_RADIUS_M },
    { field: 'eligibleCandidates', A: eligibleA, B: eligibleB },
    { field: 'eligibleNearby', A: nearbyA, B: nearbyB },
    { field: 'dispatchAttempts', A: attemptsA.length, B: attemptsB.length },
    { field: 'delivered/ack', A: delivered(attemptsA), B: delivered(attemptsB) },
    { field: 'pendingEligibleDrivers', A: pendingA, B: pendingB },
  ]);
  console.log('\n=== A candidates ===');
  console.table(ra);
  console.log('=== B candidates ===');
  console.table(rb);
  console.log('=== A dispatch attempts ===');
  console.log(attemptsA.length ? attemptsA : '(none)');
  console.log('=== B dispatch attempts ===');
  console.log(attemptsB.length ? attemptsB : '(none)');
}

async function runCaptain(idOrPhoneOrEmail, pickupArg) {
  console.log('[diagnose] db host:', mongoose.connection.host, '| db name:', mongoose.connection.name);
  const cap = await resolveCaptain(idOrPhoneOrEmail);
  if (!cap) throw new Error(`Captain not found: ${idOrPhoneOrEmail}`);
  const coords = cap.location?.coordinates || [];
  const driverLat = num(coords[1]);
  const driverLng = num(coords[0]);
  let distanceM = null;
  if (pickupArg) {
    const [lat, lng] = String(pickupArg).split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng) && driverLat != null && driverLng != null) {
      distanceM = Math.round(haversineKm(lat, lng, driverLat, driverLng) * 1000);
    }
  }
  console.log('\n=== CAPTAIN ===');
  console.table([{
    driver: mask(cap._id),
    approved: Boolean(cap.approved),
    blocked: Boolean(cap.blocked),
    status: cap.status || '-',
    isOnline: cap.isOnline ?? null,
    busy: Boolean(cap.busy),
    subscription: cap.subscriptionStatus || '-',
    subscriptionExpiresAt: cap.subscriptionExpiresAt || null,
    wallet: Number(cap.walletBalance || 0),
    servingCity: cap.servingCity || '-',
    vehicleType: cap.vehicleType || '-',
    socketRegistered: Boolean(cap.socketId),
    location: driverLat != null ? { lat: driverLat, lng: driverLng } : null,
    locationAgeMin: cap.lastLocationUpdatedAt
      ? Math.round((Date.now() - new Date(cap.lastLocationUpdatedAt).getTime()) / 60000)
      : null,
    distanceToPickupM: distanceM,
  }]);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await connectToDb();
  if (opts.compare?.[0] && opts.compare?.[1]) await runCompare(opts.compare[0], opts.compare[1]);
  else if (opts.ride) await runRide(opts.ride);
  else if (opts.user) await runUser(opts.user);
  else if (opts.captain) await runCaptain(opts.captain, opts.pickup);
  else if (opts.recent != null) await runRecent(opts.recent);
  else {
    console.log('Usage: npm run diagnose:dispatch -- --ride <id> | --user <id|email> | --compare <idA> <idB> | --captain <id|phone|email> [--pickup lat,lng] | --recent [n]');
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[diagnose] failed:', err?.message || err);
  process.exitCode = 1;
  void mongoose.disconnect().finally(() => process.exit(1));
});
