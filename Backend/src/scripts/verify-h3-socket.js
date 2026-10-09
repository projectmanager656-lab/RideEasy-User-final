/**
 * LIVE Socket.IO verification of the H3 dispatch pipeline using a REAL driver
 * client (socket.io-client), a REAL `initializeSocket()` server and a LOCAL
 * MongoDB. The Atlas cluster from `.env` is never touched — the DB URI is fixed
 * to `H3_SOCKET_URI` (default `mongodb://127.0.0.1:27099/h3_socket`) and the
 * database is dropped before and after the run. `.env` is only read for the
 * JWT secret the socket auth middleware needs.
 *
 *   mongod --port 27099 --dbpath /tmp/h3sock --logpath /tmp/h3sock.log
 *   cd Backend && node src/scripts/verify-h3-socket.js
 *
 * Proves against live sockets (spec §7/§8/§9/§12):
 *   authenticated driver join → `driver-<id>` room membership (the authoritative
 *   delivery check) → GPS tick stores h3Cell → H3 dispatch DELIVERED over the
 *   live room → client receives `rideRequest` → `rideRequest:ack` persisted
 *   (idempotent) → disconnect → dispatch recorded `failed` while the ride stays
 *   `searching` → reconnect re-offers the missed ride via `emitJoinCatchUp` →
 *   back-to-back offers with no global lock.
 */
require("dotenv").config();

const URI = process.env.H3_SOCKET_URI || "mongodb://127.0.0.1:27099/h3_socket";

const http = require("http");
const mongoose = require("mongoose");
const { latLngToCell } = require("h3-js");
const ioClient = require("socket.io-client");

const { initializeSocket, driverRoomSocketIds } = require("../socket");
const { signPayload } = require("../config/jwt.config");
const captainModel = require("../models/captain.model");
const userModel = require("../models/user.model");
const rideModel = require("../models/rideCore.model");
const DriverLocation = require("../models/driverLocation.model");
const RideDispatch = require("../models/rideDispatch.model");
const rideController = require("../controllers/ride.controller");

/* Inside the real Kolhapur service circle so catch-up/pending filters accept the rides. */
const PICKUP = { lat: 16.705, lng: 74.243 };
/* Driver sits ~111 m from the pickup — same H3 ring neighbourhood. */
const DRIVER_POS = { lat: PICKUP.lat + 0.001, lng: PICKUP.lng };
const expectedCell = latLngToCell(DRIVER_POS.lat, DRIVER_POS.lng, 9);

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000, step = 50) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(step);
  }
  return false;
}
function once(client, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for '${event}'`)), timeoutMs);
    client.once(event, (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

async function mkRide(user, { lat, lng }) {
  return rideModel.create({
    user: user._id,
    pickupLocation: "H3 socket pickup",
    dropLocation: "H3 socket drop",
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

async function main() {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 4000 });
  await mongoose.connection.dropDatabase();
  await Promise.all([captainModel.init(), rideModel.init(), DriverLocation.init(), RideDispatch.init()]);

  const captain = await captainModel.create({
    name: "H3 Socket Driver",
    phone: "9876500001",
    email: `h3-socket-${Date.now()}@test.local`,
    password: "secret123",
    vehicleType: "AUTO",
    servingCity: "Kolhapur",
    status: "inactive",
    isOnline: false,
    approved: true,
    blocked: false,
    subscriptionStatus: "active",
    subscriptionExpiresAt: new Date(Date.now() + 86400000),
    walletBalance: 500,
    busy: false,
    location: { type: "Point", coordinates: [DRIVER_POS.lng, DRIVER_POS.lat] },
    lastLocationUpdatedAt: new Date(),
  });
  const user = await userModel.create({
    name: "H3 Socket User",
    phone: "9876500002",
    email: `h3-socket-user-${Date.now()}@test.local`,
    password: "secret123",
  });
  const token = signPayload({ _id: String(captain._id), role: "captain" });

  const server = http.createServer();
  initializeSocket(server);
  await new Promise((resolve) => server.listen(0, resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  /** Every rideRequest frame any client connection received, in arrival order. */
  const received = [];
  function newDriver() {
    const c = ioClient(url, { auth: { token }, reconnection: false, transports: ["websocket"] });
    c.on("rideRequest", (payload) => received.push({ at: Date.now(), payload }));
    return c;
  }
  async function waitForOffer(pred, timeoutMs = 8000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const hit = received.find((r) => pred(r.payload));
      if (hit) return hit.payload;
      await sleep(50);
    }
    return null;
  }

  console.log("\n=== 1. authenticated driver join → live room + GPS/h3Cell ===");
  let driver = newDriver();
  await once(driver, "connect");
  driver.emit("join", { city: "Kolhapur", lat: DRIVER_POS.lat, lng: DRIVER_POS.lng });
  check(
    "driver joined its driver-<id> room (authoritative delivery check)",
    await until(() => driverRoomSocketIds(captain._id).length === 1),
  );
  driver.emit("driver:location-update", { lat: DRIVER_POS.lat, lng: DRIVER_POS.lng, heading: 90, speed: 6, accuracy: 8 });
  check(
    "GPS tick stored h3Cell + fresh captain position",
    await until(async () => {
      const row = await DriverLocation.findOne({ driverId: captain._id }).lean();
      const cap = await captainModel.findById(captain._id).lean();
      return row && row.h3Cell === expectedCell && row.accuracy === 8 && cap.lastLocationUpdatedAt;
    }),
  );

  console.log("\n=== 2. H3 dispatch delivered over the live socket room ===");
  const ride1 = await mkRide(user, PICKUP);
  const d1 = await rideController.startRideDispatch(ride1._id);
  check("ride1 matched AND delivered to the live room", d1.matched === 1 && d1.delivered === 1, JSON.stringify(d1));
  const offer1 = await waitForOffer((p) => String(p.ride?._id) === String(ride1._id) && !p.catchUp);
  check("client received the rideRequest frame", Boolean(offer1));

  console.log("\n=== 3. rideRequest:ack persisted (idempotent) ===");
  driver.emit("rideRequest:ack", { rideId: String(ride1._id) });
  check(
    "offer recorded on the ride",
    await until(async () => {
      const r = await rideModel.findById(ride1._id).lean();
      return r.offerAcks?.length === 1;
    }),
  );
  const rec1 = await RideDispatch.findOne({ rideId: ride1._id, captainId: captain._id }).lean();
  check("ride_dispatches row acknowledged", rec1 && rec1.status === "acknowledged" && rec1.driverAcknowledged === true, rec1 ? rec1.status : "missing");
  driver.emit("rideRequest:ack", { rideId: String(ride1._id) });
  await sleep(500);
  const ride1After = await rideModel.findById(ride1._id).lean();
  check("duplicate ACK is idempotent (one offerAcks entry)", ride1After.offerAcks.length === 1, `acks=${ride1After.offerAcks.length}`);

  console.log("\n=== 4. disconnect → dispatch fails honestly, ride NOT lost ===");
  driver.disconnect();
  check("driver room emptied on disconnect", await until(() => driverRoomSocketIds(captain._id).length === 0));
  const ride2 = await mkRide(user, PICKUP);
  const d2 = await rideController.startRideDispatch(ride2._id);
  check("ride2 matched but NOT delivered (no live socket)", d2.matched === 1 && d2.delivered === 0, JSON.stringify(d2));
  const rec2 = await RideDispatch.findOne({ rideId: ride2._id, captainId: captain._id }).lean();
  check("dispatch recorded failed with NO_LIVE_DRIVER_SOCKET", rec2 && rec2.status === "failed" && rec2.failureReason === "NO_LIVE_DRIVER_SOCKET", rec2 ? `${rec2.status}/${rec2.failureReason}` : "missing");
  const ride2Doc = await rideModel.findById(ride2._id).lean();
  check("ride stays searching for recovery (captain still null)", ride2Doc.status === "searching" && !ride2Doc.captain);

  console.log("\n=== 5. reconnect → missed ride re-offered by emitJoinCatchUp ===");
  driver = newDriver();
  await once(driver, "connect");
  driver.emit("join", { city: "Kolhapur", lat: DRIVER_POS.lat, lng: DRIVER_POS.lng });
  const catchUpOffer = await waitForOffer((p) => String(p.ride?._id) === String(ride2._id) && p.catchUp === true);
  check("reconnected driver received the missed ride as a catch-up offer", Boolean(catchUpOffer));
  check("driver room re-populated after reconnect", await until(() => driverRoomSocketIds(captain._id).length === 1));

  console.log("\n=== 6. back-to-back live offers (no global dispatch lock) ===");
  const ride3 = await mkRide(user, PICKUP);
  const d3 = await rideController.startRideDispatch(ride3._id);
  check("ride3 delivered while ride2 is still searching", d3.matched === 1 && d3.delivered === 1, JSON.stringify(d3));
  const offer3 = await waitForOffer((p) => String(p.ride?._id) === String(ride3._id));
  check("client received the second offer too", Boolean(offer3));
  const ride2Still = await rideModel.findById(ride2._id).lean();
  check("ride2 untouched by the ride3 dispatch", ride2Still.status === "searching" && !ride2Still.captain);

  driver.disconnect();
  /**
   * The server's async `disconnect` handler still runs DB writes (socketId
   * cleanup) for this client — give it time to finish before closing the HTTP
   * server and the Mongo client, otherwise that in-flight op is aborted mid-flight.
   */
  await sleep(700);
  server.close();
  await sleep(100);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error("\nSOCKET VERIFY ERROR:", err);
  try {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
