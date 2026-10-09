/**
 * LIVE end-to-end verification of H3 hexagon driver matching against a LOCAL
 * MongoDB. It never touches the configured Atlas cluster — the URI is fixed to
 * `H3_VERIFY_URI` (default `mongodb://127.0.0.1:27099/h3_verify`) and the
 * database is dropped before and after the run.
 *
 *   mongod --port 27099 --dbpath /tmp/h3verify --fork --logpath /tmp/h3verify.log
 *   cd Backend && node src/scripts/verify-h3-match.js
 *
 * What it proves against a real database (spec §17):
 *   pickup → H3 cell → Ring 0..3 → eligible drivers → ACTUAL GPS distance
 *   ranking → existing ride_dispatches records → dispatch attempt logging,
 *   driver movement between hexagons, stale/offline/wrong-vehicle/on-ride
 *   exclusion, back-to-back rides (no global lock), re-dispatch attempt
 *   counting, /rides/pending recovery, and the atomic acceptance race
 *   (first valid acceptance wins, loser gets 409).
 *
 * Only the Socket.IO FRAME DELIVERY boundary is stubbed (no live clients are
 * attached here); room naming, ride_dispatches bookkeeping and every database
 * read/write run for real.
 */

const URI = process.env.H3_VERIFY_URI || "mongodb://127.0.0.1:27099/h3_verify";

/** Stub frame delivery BEFORE ride.controller destructures the socket module. */
const socket = require("../socket");
const dispatched = [];
socket.emitToCaptain = (id, event, payload) => {
  dispatched.push({ captainId: String(id), event });
  return 1;
};
socket.emitToUser = () => {};
socket.emitStandardRidePhase = () => {};
socket.driverRoomHyphen = (id) => `driver-${id}`;
socket.driverRoomSocketIds = () => ["live-socket"];
socket.onlineDriversSocketCount = () => 1;

const mongoose = require("mongoose");
const { latLngToCell, gridRing, cellToLatLng } = require("h3-js");
const captainModel = require("../models/captain.model");
const userModel = require("../models/user.model");
const rideModel = require("../models/rideCore.model");
const DriverLocation = require("../models/driverLocation.model");
const RideDispatch = require("../models/rideDispatch.model");
const driverHex = require("../services/driverHex.service");
const rideCore = require("../services/rideCore.service");
const rideController = require("../controllers/ride.controller");
const { RIDE_REQUEST } = require("../socket/rideSocket.events");
const { haversineKm } = require("../utils/serviceArea");

/* Inside the real Kolhapur service circle so /rides/pending's service-area
 * filter accepts the synthetic rides (dispatch itself does not filter area). */
const PICKUP = { lat: 16.705, lng: 74.243 };
const pickupCell = latLngToCell(PICKUP.lat, PICKUP.lng, 9);
const [ring3Lat, ring3Lng] = cellToLatLng(gridRing(pickupCell, 3)[0]);

let passed = 0;
let failed = 0;
function check(name, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function responseStub() {
  const res = {};
  res.set = () => res;
  res.status = (code) => {
    res.code = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return body;
  };
  return res;
}

async function mkCaptain(label, coords, over = {}) {
  return captainModel.create({
    name: `H3 Driver ${label}`,
    phone: `987654${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`,
    email: `h3-${label}-${Date.now()}@test.local`,
    password: "secret123",
    vehicleType: "AUTO",
    servingCity: "Kolhapur",
    status: "active",
    isOnline: true,
    approved: true,
    blocked: false,
    subscriptionStatus: "active",
    subscriptionExpiresAt: new Date(Date.now() + 86400000),
    walletBalance: 500,
    busy: false,
    location: { type: "Point", coordinates: [coords.lng, coords.lat] },
    lastLocationUpdatedAt: new Date(),
    ...over,
  });
}

async function mkRide({ lat, lng }) {
  return rideModel.create({
    user: global.__h3User._id,
    pickupLocation: "H3 verify pickup",
    dropLocation: "H3 verify drop",
    pickup: { type: "Point", coordinates: [lng, lat] },
    drop: { type: "Point", coordinates: [lng + 0.01, lat + 0.01] },
    city: "Kolhapur",
    vehicleType: "AUTO",
    distance: 2.5,
    price: 120,
    paymentMethod: "Cash",
    status: "searching",
    searchStartedAt: new Date(),
  });
}

function requestOffers() {
  return dispatched.filter((d) => d.event === RIDE_REQUEST).map((d) => d.captainId);
}

async function main() {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 4000 });
  await mongoose.connection.dropDatabase();
  await Promise.all([captainModel.init(), rideModel.init(), DriverLocation.init(), RideDispatch.init()]);

  console.log("\n=== 0. schema / index ===");
  const idx = await DriverLocation.collection.getIndexes();
  check("driverlocations has the h3Cell index", Object.keys(idx).some((k) => k.startsWith("h3Cell_1")));
  check("existing coordinates/recordedAt indexes kept", Object.keys(idx).some((k) => k.includes("coordinates")) && Object.keys(idx).some((k) => k.startsWith("recordedAt_1")));

  global.__h3User = await userModel.create({
    name: "H3 Verify User",
    phone: "9000000001",
    email: `h3-user-${Date.now()}@test.local`,
    password: "secret123",
  });

  /** Seeded drivers: 4 eligible (GPS-fresh), 4 that must be excluded. */
  const near = await mkCaptain("near", { lat: PICKUP.lat + 0.001, lng: PICKUP.lng });
  const far = await mkCaptain("far", { lat: PICKUP.lat + 0.004, lng: PICKUP.lng });
  const neighbor = await mkCaptain("neighbor", { lat: ring3Lat, lng: ring3Lng });
  const mover = await mkCaptain("mover", { lat: PICKUP.lat + 0.0006, lng: PICKUP.lng });
  const stale = await mkCaptain("stale", { lat: PICKUP.lat + 0.0005, lng: PICKUP.lng });
  const offline = await mkCaptain("offline", { lat: PICKUP.lat + 0.0007, lng: PICKUP.lng }, { isOnline: false });
  const wrongVehicle = await mkCaptain("wrongvehicle", { lat: PICKUP.lat + 0.0008, lng: PICKUP.lng }, { vehicleType: "BIKE" });
  const onRide = await mkCaptain("onride", { lat: PICKUP.lat + 0.0009, lng: PICKUP.lng }, { busy: true });

  for (const [cap, offset] of [
    [near, 0.001],
    [far, 0.004],
    [mover, 0.0006],
    [stale, 0.0005],
    [offline, 0.0007],
    [wrongVehicle, 0.0008],
    [onRide, 0.0009],
  ]) {
    await driverHex.recordDriverGps({ driverId: cap._id, lat: PICKUP.lat + offset, lng: PICKUP.lng });
  }
  await driverHex.recordDriverGps({ driverId: neighbor._id, lat: ring3Lat, lng: ring3Lng });

  /** Make the stale driver's GPS + captain position genuinely old (10 min > 5 min window). */
  const old = new Date(Date.now() - 10 * 60 * 1000);
  await DriverLocation.updateOne({ driverId: stale._id }, { $set: { recordedAt: old } });
  await captainModel.updateOne({ _id: stale._id }, { $set: { lastLocationUpdatedAt: old } });

  console.log("\n=== 1. pickup → H3 cell → rings → eligible → GPS rank → dispatch ===");
  const ride1 = await mkRide(PICKUP);
  dispatched.length = 0;
  const d1 = await rideController.startRideDispatch(ride1._id);
  const offers1 = requestOffers();

  const eligible = [
    { cap: near, lat: PICKUP.lat + 0.001 },
    { cap: far, lat: PICKUP.lat + 0.004 },
    { cap: neighbor, lat: ring3Lat },
    { cap: mover, lat: PICKUP.lat + 0.0006 },
  ]
    .map((e) => ({ id: String(e.cap._id), km: haversineKm(PICKUP.lat, PICKUP.lng, e.lat, PICKUP.lng) }))
    .sort((a, b) => a.km - b.km)
    .map((e) => e.id);

  const h3Prefix = offers1.slice(0, eligible.length);
  check("H3 nearby set = the 4 eligible drivers, nearest → farthest by real GPS distance", JSON.stringify(h3Prefix) === JSON.stringify(eligible), `got ${JSON.stringify(h3Prefix)} want ${JSON.stringify(eligible)}`);
  check("stale-GPS driver excluded from H3 nearby set", !h3Prefix.includes(String(stale._id)));
  check("driver already on a ride excluded from H3 nearby set", !h3Prefix.includes(String(onRide._id)));
  check("offline driver never dispatched", !offers1.includes(String(offline._id)));
  check("wrong vehicle type never dispatched", !offers1.includes(String(wrongVehicle._id)));
  check("existing same-city fallback still merged after the nearby set", offers1.length === eligible.length + 2, `offers=${offers1.length}`);
  check("dispatch reported matched + delivered", d1.matched === offers1.length && d1.delivered === offers1.length, JSON.stringify(d1));

  const recs1 = await RideDispatch.find({ rideId: ride1._id }).lean();
  check("one ride_dispatches row per matched captain", recs1.length === d1.matched, `rows=${recs1.length} matched=${d1.matched}`);
  check("rows delivered via the driver-<id> room with attempt=1", recs1.every((r) => r.status === "delivered" && r.dispatchAttempts === 1 && r.socketRoom === `driver-${String(r.captainId)}`));

  console.log("\n=== 2. back-to-back rides (dispatch state scoped per ride + captain) ===");
  dispatched.length = 0;
  const ride2 = await mkRide({ lat: PICKUP.lat + 0.02, lng: PICKUP.lng });
  const d2 = await rideController.startRideDispatch(ride2._id);
  const recs2 = await RideDispatch.find({ rideId: ride2._id }).lean();
  check("second ride dispatched while the first is still searching (no global lock)", d2.matched > 0 && recs2.length === d2.matched, JSON.stringify(d2));
  check("ride 1 dispatch rows untouched by ride 2", (await RideDispatch.find({ rideId: ride1._id }).lean()).every((r) => r.dispatchAttempts === 1));

  console.log("\n=== 3. re-dispatch increments attempts without duplicate rows ===");
  dispatched.length = 0;
  await rideController.startRideDispatch(ride1._id);
  const recs1b = await RideDispatch.find({ rideId: ride1._id }).lean();
  check("re-dispatch bumps dispatchAttempts to 2, still one row per (ride, captain)", recs1b.length === d1.matched && recs1b.every((r) => r.dispatchAttempts === 2), `rows=${recs1b.length}`);

  console.log("\n=== 4. driver moves to another hexagon ===");
  await driverHex.recordDriverGps({ driverId: mover._id, lat: ring3Lat, lng: ring3Lng });
  await captainModel.updateOne({ _id: mover._id }, { $set: { location: { type: "Point", coordinates: [ring3Lng, ring3Lat] }, lastLocationUpdatedAt: new Date() } });
  const moverRow = await DriverLocation.findOne({ driverId: mover._id }).lean();
  check("h3Cell updated in place after crossing a hexagon", moverRow && moverRow.h3Cell === ring3Cells0(), `got ${moverRow && moverRow.h3Cell}`);
  const ring0Ids = await driverHex.getFreshDriverIdsInCells([pickupCell]);
  check("moved driver no longer in the pickup hexagon", !ring0Ids.includes(String(mover._id)));
  dispatched.length = 0;
  const ride3 = await mkRide(PICKUP);
  await rideController.startRideDispatch(ride3._id);
  check("moved driver still discovered through its NEW cell", requestOffers().includes(String(mover._id)));

  console.log("\n=== 5. /rides/pending recovery for a matched-but-offline driver ===");
  const res = responseStub();
  await rideController.getPendingRides({ captain: { _id: far._id } }, res);
  check("pending poll returns the still-searching ride", res.code === 200 && Array.isArray(res.body) && res.body.some((r) => String(r._id) === String(ride1._id)), `code=${res.code}`);

  console.log("\n=== 6. acceptance race: first valid acceptance wins ===");
  const raceRide = await mkRide(PICKUP);
  const results = await Promise.allSettled([
    rideCore.confirmRide({ rideId: raceRide._id, captain: stale }),
    rideCore.confirmRide({ rideId: raceRide._id, captain: offline }),
  ]);
  const winners = results.filter((r) => r.status === "fulfilled");
  const loser = results.find((r) => r.status === "rejected");
  check("exactly one driver wins the simultaneous accept", winners.length === 1);
  check("loser gets 409 already-assigned", Boolean(loser) && loser.reason.statusCode === 409 && /already assigned/i.test(loser.reason.message), loser ? `${loser.reason.statusCode} ${loser.reason.message}` : "none");
  const raced = await rideModel.findById(raceRide._id);
  const winnerCapDoc = winners.length ? winners[0].value.ride.captain : null;
  const winnerId = winnerCapDoc ? String(winnerCapDoc._id || winnerCapDoc) : "";
  check("ride assigned to exactly one captain", String(raced.captain) === winnerId && raced.status === "accepted", `captain=${raced.captain}`);
  const winnerCap = await captainModel.findById(winnerId);
  check("winner marked busy (second ride to that driver blocked until released)", winnerCap.busy === true);

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

function ring3Cells0() {
  return gridRing(pickupCell, 3)[0];
}

main().catch(async (err) => {
  console.error("\nVERIFY ERROR:", err);
  try {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
