/**
 * H3 hexagon driver discovery — matching pipeline coverage (spec §17):
 *
 *   pickup cell → Ring 0 → Ring 1 → Ring 2 → Ring 3 → eligible drivers
 *   → ACTUAL GPS distance ranking → existing Socket.IO dispatch.
 *
 * h3-js is the REAL library here (cells/rings are genuine), while the
 * `driverlocations` store and the Mongo eligibility query are mocked — Mongo
 * itself decides eligibility in production, so the tests assert the exact
 * filter clauses handed to it (online / vehicle / city / not-busy / fresh GPS)
 * and the exact candidate ids that come back out.
 */

jest.mock("../../models/driverLocation.model", () => ({
  distinct: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock("../../services/pricing.service", () => ({
  getCaptainPricing: jest.fn(),
}));
jest.mock("../../services/rideCore.service", () => ({
  normalizeVehicleType: jest.fn((value) => value),
  releaseCaptainBusyIfAvailable: jest.fn(),
  captainVehicleTypesForRide: jest.fn((value) => {
    const norm = String(value || "").toUpperCase();
    return norm === "CAR" ? ["CAR", "MINI", "SEDAN"] : [norm];
  }),
}));
jest.mock("../../models/captain.model", () => ({
  find: jest.fn(),
  findById: jest.fn(),
  countDocuments: jest.fn(() => Promise.resolve(0)),
}));
jest.mock("../../models/rideCore.model", () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findById: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../services/payment.service", () => ({}));
jest.mock("../../services/maps.service", () => ({}));
jest.mock("../../services/rideDispatch.service", () => ({
  recordDispatchAttemptSafe: jest.fn(async () => ({ dispatchAttempts: 1 })),
  markDispatchAcknowledgedSafe: jest.fn(),
  markRideDispatchesStatusSafe: jest.fn(),
}));
jest.mock("../../socket", () => ({
  emitToUser: jest.fn(),
  emitToCaptain: jest.fn(),
  emitStandardRidePhase: jest.fn(),
  driverRoomHyphen: jest.fn((id) => `driver-${id}`),
  driverRoomSocketIds: jest.fn(() => ["sock-live"]),
  onlineDriversSocketCount: jest.fn(() => 1),
}));
jest.mock("../../socket/rideSocket.events", () => ({
  RIDE_REQUEST: "ride:request",
  RIDE_ACCEPTED: "ride:accepted",
  RIDE_STARTED: "ride:started",
  RIDE_COMPLETED: "ride:completed",
}));

const { latLngToCell, gridRing, cellToLatLng } = require("h3-js");
const pricingService = require("../../services/pricing.service");
const DriverLocation = require("../../models/driverLocation.model");
const captainModel = require("../../models/captain.model");
const rideModel = require("../../models/rideCore.model");
const { emitToCaptain, driverRoomSocketIds } = require("../../socket");
const { recordDispatchAttemptSafe } = require("../../services/rideDispatch.service");
const driverHex = require("../../services/driverHex.service");
const rideController = require("../../controllers/ride.controller");

const RES = 9;
const PICKUP = { lat: 12.97, lng: 77.59 };
const pickupCell = latLngToCell(PICKUP.lat, PICKUP.lng, RES);
const ring1Cells = gridRing(pickupCell, 1);
const ring3Cells = gridRing(pickupCell, 3);
const ring4Cells = gridRing(pickupCell, 4);
const [ring1Lat, ring1Lng] = cellToLatLng(ring1Cells[0]);
const [ring3Lat, ring3Lng] = cellToLatLng(ring3Cells[0]);
const [ring4Lat, ring4Lng] = cellToLatLng(ring4Cells[0]);
const FRESH_MS = 5 * 60 * 1000;

/** Mongoose-like chainable, awaitable query stand-in. */
function queryReturning(value) {
  const q = {};
  q.select = jest.fn(() => q);
  q.limit = jest.fn(() => q);
  q.sort = jest.fn(() => q);
  q.lean = jest.fn(() => q);
  q.populate = jest.fn(() => q);
  q.then = (onFulfilled, onRejected) =>
    Promise.resolve(typeof value === "function" ? value() : value).then(onFulfilled, onRejected);
  return q;
}

/** Emulate the driverlocations distinct query: cell match + freshness cutoff. */
function seedRows(rows) {
  DriverLocation.distinct.mockImplementation(async (_field, filter) => {
    const cells = new Set(filter.h3Cell.$in);
    const cutoff = filter.recordedAt.$gte;
    return rows.filter((r) => cells.has(r.cell) && r.recordedAt >= cutoff).map((r) => r.id);
  });
}

function docAt(id, latOffset) {
  return {
    _id: id,
    location: { type: "Point", coordinates: [PICKUP.lng, PICKUP.lat + latOffset] },
  };
}

let logSpy;
let warnSpy;

beforeEach(() => {
  jest.clearAllMocks();
  pricingService.getCaptainPricing.mockResolvedValue({ minimumWalletBalance: 50 });
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  driverRoomSocketIds.mockReturnValue(["sock-live"]);
});

afterEach(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
});

describe("driverHex.service — hexagon discovery", () => {
  test("computes the real H3 res-9 cell and rejects unusable coordinates", () => {
    expect(driverHex.getDriverCell(PICKUP.lat, PICKUP.lng)).toBe(pickupCell);
    expect(driverHex.getDriverCell("x", 77.59)).toBeNull();
    expect(driverHex.getDriverCell(999, 77.59)).toBeNull();
    expect(driverHex.getDriverCell(null, null)).toBeNull();
  });

  test("ring expansion covers Ring 0 through Ring 3 (1 + 6 + 12 + 18 cells)", () => {
    expect(driverHex.getNearbyCells(PICKUP.lat, PICKUP.lng, 0)).toEqual([pickupCell]);
    expect(driverHex.getNearbyCells(PICKUP.lat, PICKUP.lng, 3)).toHaveLength(37);
    expect(driverHex.getRingCells(pickupCell, 1)).toEqual(ring1Cells);
  });

  test("1. driver in the SAME hexagon is found at Ring 0 and the search stops once enough candidates exist", async () => {
    seedRows([{ id: "same-hex", cell: pickupCell, recordedAt: new Date() }]);
    const isEligible = jest.fn(async (ids) => ids.map((id) => docAt(id, 0.001)));

    const result = await driverHex.getCandidateDrivers({
      pickupLat: PICKUP.lat,
      pickupLng: PICKUP.lng,
      rideId: "ride-same",
      minCandidates: 1,
      isEligible,
    });

    expect(result.pickupCell).toBe(pickupCell);
    expect(result.ringUsed).toBe(0);
    expect(result.candidates.map((c) => String(c._id))).toEqual(["same-hex"]);
    expect(isEligible).toHaveBeenCalledTimes(1);
    expect(isEligible).toHaveBeenCalledWith(["same-hex"]);
    /** Enough candidates at Ring 0 → Ring 1..3 were never queried. */
    expect(DriverLocation.distinct).toHaveBeenCalledTimes(1);
    expect(DriverLocation.distinct.mock.calls[0][1].h3Cell.$in).toEqual([pickupCell]);
    expect(DriverLocation.distinct.mock.calls[0][1].recordedAt.$gte.getTime()).toBeLessThanOrEqual(
      Date.now() - FRESH_MS + 1000,
    );
    expect(logSpy.mock.calls.some((c) => c[0] === "[H3 MATCH]" && c[1].ring === 0)).toBe(true);
    expect(logSpy.mock.calls.some((c) => c[0] === "[DRIVER RANK]")).toBe(true);
  });

  test("2. driver in a NEIGHBORING hexagon is discovered at Ring 1", async () => {
    seedRows([{ id: "neighbor", cell: ring1Cells[0], recordedAt: new Date() }]);
    const isEligible = jest.fn(async (ids) => ids.map((id) => docAt(id, 0.001)));

    const result = await driverHex.getCandidateDrivers({
      pickupLat: PICKUP.lat,
      pickupLng: PICKUP.lng,
      minCandidates: 1,
      isEligible,
    });

    expect(result.ringUsed).toBe(1);
    expect(result.candidates.map((c) => String(c._id))).toEqual(["neighbor"]);
    expect(isEligible).toHaveBeenCalledTimes(1);
    expect(isEligible).toHaveBeenCalledWith(["neighbor"]);
    expect(DriverLocation.distinct).toHaveBeenCalledTimes(2);
  });

  test("3. driver several hexagons away is found at Ring 3; one beyond the max ring is never searched", async () => {
    seedRows([
      { id: "ring3-driver", cell: ring3Cells[0], recordedAt: new Date() },
      { id: "ring4-driver", cell: ring4Cells[0], recordedAt: new Date() },
    ]);
    const isEligible = jest.fn(async (ids) => ids.map((id) => docAt(id, 0.001)));

    const result = await driverHex.getCandidateDrivers({
      pickupLat: PICKUP.lat,
      pickupLng: PICKUP.lng,
      minCandidates: 1,
      isEligible,
    });

    expect(result.ringUsed).toBe(3);
    expect(result.candidates.map((c) => String(c._id))).toEqual(["ring3-driver"]);
    /** Max ring respected: only 4 distinct queries (Ring 0..3), Ring 4 never asked. */
    expect(DriverLocation.distinct).toHaveBeenCalledTimes(4);
    const queriedCells = DriverLocation.distinct.mock.calls.flatMap((c) => c[1].h3Cell.$in);
    expect(queriedCells).not.toContain(ring4Cells[0]);
    /** The real location of the Ring-3 driver is measured by GPS, not by its cell. */
    expect(result.candidates[0].distanceKm).toBeGreaterThan(0);
    expect(result.candidates[0].distanceKm).toBeLessThan(5);
  });

  test("4. multiple drivers in the same hexagon are ranked by REAL GPS distance, nearest first, and beyond-radius docs drop out", async () => {
    seedRows([
      { id: "near-driver", cell: pickupCell, recordedAt: new Date() },
      { id: "far-driver", cell: pickupCell, recordedAt: new Date() },
      { id: "too-far-driver", cell: pickupCell, recordedAt: new Date() },
    ]);
    const isEligible = jest.fn(async (ids) =>
      ids.map((id) => {
        if (id === "near-driver") return docAt(id, 0.001);
        if (id === "far-driver") return docAt(id, 0.004);
        /** ~11 km away: inside the same hexagon lookup but outside the ride radius. */
        return docAt(id, 0.1);
      }),
    );

    const result = await driverHex.getCandidateDrivers({
      pickupLat: PICKUP.lat,
      pickupLng: PICKUP.lng,
      minCandidates: 10,
      isEligible,
    });

    expect(result.candidates.map((c) => String(c._id))).toEqual(["near-driver", "far-driver"]);
    expect(result.candidates[0].distanceKm).toBeLessThan(result.candidates[1].distanceKm);
    expect(
      logSpy.mock.calls.filter((c) => c[0] === "[DRIVER RANK]").map((c) => c[1].captainId),
    ).toEqual(["near-driver", "far-driver"]);
  });

  test("6. driver with STALE GPS is excluded by the freshness cutoff — nothing is deleted", async () => {
    seedRows([
      { id: "fresh-driver", cell: pickupCell, recordedAt: new Date() },
      { id: "stale-driver", cell: pickupCell, recordedAt: new Date(Date.now() - FRESH_MS - 1000) },
    ]);
    const isEligible = jest.fn(async (ids) => ids.map((id) => docAt(id, 0.001)));

    const result = await driverHex.getCandidateDrivers({
      pickupLat: PICKUP.lat,
      pickupLng: PICKUP.lng,
      minCandidates: 1,
      isEligible,
    });

    expect(result.candidates.map((c) => String(c._id))).toEqual(["fresh-driver"]);
    expect(isEligible).toHaveBeenCalledWith(["fresh-driver"]);
    const filter = DriverLocation.distinct.mock.calls[0][1];
    expect(filter.recordedAt.$gte).toBeInstanceOf(Date);
    expect(filter.recordedAt.$gte.getTime()).toBeGreaterThan(Date.now() - FRESH_MS - 2000);
  });

  test("9. driver moving to another hexagon is found in the NEW cell on the next search", async () => {
    const store = new Map();
    DriverLocation.findOneAndUpdate.mockImplementation(async (filter, update) => {
      const row = store.get(filter.driverId) || { id: filter.driverId };
      Object.assign(row, update.$set);
      store.set(filter.driverId, row);
      return row;
    });
    DriverLocation.distinct.mockImplementation(async (_field, filter) => {
      const cells = new Set(filter.h3Cell.$in);
      const cutoff = filter.recordedAt.$gte;
      return [...store.values()]
        .filter((r) => cells.has(r.cell || r.h3Cell) && r.recordedAt >= cutoff)
        .map((r) => r.id);
    });
    const isEligible = jest.fn(async (ids) => ids.map((id) => docAt(id, 0.001)));

    /** GPS update 1: driver sits in the pickup hexagon. */
    await driverHex.recordDriverGps({ driverId: "mover", lat: PICKUP.lat, lng: PICKUP.lng });
    expect(DriverLocation.findOneAndUpdate).toHaveBeenCalledWith(
      { driverId: "mover", h3Cell: { $exists: true } },
      expect.objectContaining({ $set: expect.objectContaining({ h3Cell: pickupCell }) }),
      expect.any(Object),
    );
    let result = await driverHex.getCandidateDrivers({
      pickupLat: PICKUP.lat,
      pickupLng: PICKUP.lng,
      minCandidates: 1,
      isEligible,
    });
    expect(result.ringUsed).toBe(0);
    expect(result.candidates.map((c) => String(c._id))).toEqual(["mover"]);

    /** GPS update 2: the driver crosses into a neighbouring hexagon. */
    await driverHex.recordDriverGps({ driverId: "mover", lat: ring1Lat, lng: ring1Lng });
    expect(store.get("mover").h3Cell).toBe(ring1Cells[0]);
    result = await driverHex.getCandidateDrivers({
      pickupLat: PICKUP.lat,
      pickupLng: PICKUP.lng,
      minCandidates: 1,
      isEligible,
    });
    /** Same driver, new cell: Ring 0 no longer matches, Ring 1 does — no manual refresh. */
    expect(result.ringUsed).toBe(1);
    expect(result.candidates.map((c) => String(c._id))).toEqual(["mover"]);

    /** Unusable coordinates are never recorded. */
    await expect(driverHex.recordDriverGps({ driverId: "mover", lat: "x", lng: 1 })).resolves.toBeNull();
  });
});

describe("startRideDispatch — H3 candidates → GPS ranking → existing Socket.IO dispatch", () => {
  const ride = {
    _id: "ride-h3-1",
    status: "searching",
    city: "Kolhapur",
    vehicleType: "AUTO",
    pickup: { coordinates: [PICKUP.lng, PICKUP.lat] },
    user: "user-1",
    captain: null,
  };

  function seedCaptainQueries({ h3Docs, nearDocs = [], cityDocs = [] }) {
    captainModel.find.mockImplementation((filter) => {
      if (filter?.$and?.some((c) => c?._id?.$in)) return queryReturning(h3Docs);
      if (filter?.location?.$near) return queryReturning(nearDocs);
      return queryReturning(cityDocs);
    });
    captainModel.findById.mockImplementation(() =>
      queryReturning({ socketId: "stored-socket", status: "active", isOnline: true }),
    );
  }

  test("5/7/8. eligible H3 candidates are dispatched nearest-first over the existing driver rooms; city fallback still merged", async () => {
    rideModel.findById.mockReturnValue(queryReturning(ride));
    seedRows([
      { id: "cap-near", cell: pickupCell, recordedAt: new Date() },
      { id: "cap-far", cell: pickupCell, recordedAt: new Date() },
    ]);
    seedCaptainQueries({
      h3Docs: [docAt("cap-far", 0.004), docAt("cap-near", 0.001)],
      cityDocs: [{ _id: "city-driver" }],
    });
    emitToCaptain.mockReturnValue(1);

    const dispatch = await rideController.startRideDispatch(ride._id);

    expect(dispatch).toEqual({ matched: 3, delivered: 3 });
    const requestCalls = emitToCaptain.mock.calls.filter((c) => c[1] === "ride:request");
    expect(requestCalls.map((c) => c[0])).toEqual(["cap-near", "cap-far", "city-driver"]);

    /** §4 filters handed to Mongo for the ring candidates. */
    const h3Filter = captainModel.find.mock.calls
      .map((c) => c[0])
      .find((f) => f?.$and?.some((c) => c?._id?.$in));
    expect(h3Filter.$and.some((c) => c.busy && c.busy.$ne === true)).toBe(true);
    expect(
      h3Filter.$and.some((c) => c.lastLocationUpdatedAt && c.lastLocationUpdatedAt.$gte instanceof Date),
    ).toBe(true);
    expect(
      h3Filter.$and.some((c) => Array.isArray(c.vehicleType?.$in) && c.vehicleType.$in.includes("AUTO")),
    ).toBe(true);
    expect(
      h3Filter.$and.some((c) => Array.isArray(c.approved) === false && c.approved === true),
    ).toBe(true);
    expect(h3Filter.$and.some((c) => c._id?.$in?.length === 2)).toBe(true);

    /** §18 logs: [H3 MATCH] with ring/candidateCount, [DISPATCH] with socketCount/attempt. */
    const h3Logs = logSpy.mock.calls.filter((c) => c[0] === "[H3 MATCH]");
    expect(h3Logs[0][1]).toMatchObject({ rideId: ride._id, pickupCell, candidateCount: 2 });
    const dispatchLogs = logSpy.mock.calls.filter((c) => c[0] === "[DISPATCH]");
    expect(dispatchLogs[0][1]).toMatchObject({
      rideId: ride._id,
      captainId: "cap-near",
      socketCount: 1,
      attempt: 1,
    });
    expect(recordDispatchAttemptSafe).toHaveBeenCalledWith(
      expect.objectContaining({ rideId: ride._id, captainId: "cap-near" }),
    );
  });

  test("empty hexagon index (first deploy) falls back to the existing $near query", async () => {
    rideModel.findById.mockReturnValue(queryReturning(ride));
    DriverLocation.distinct.mockResolvedValue([]);
    seedCaptainQueries({ h3Docs: [], nearDocs: [{ _id: "legacy-driver" }] });
    emitToCaptain.mockReturnValue(1);

    const dispatch = await rideController.startRideDispatch(ride._id);

    expect(dispatch).toEqual({ matched: 1, delivered: 1 });
    expect(emitToCaptain.mock.calls.filter((c) => c[1] === "ride:request").map((c) => c[0])).toEqual([
      "legacy-driver",
    ]);
    const nearFilter = captainModel.find.mock.calls.map((c) => c[0]).find((f) => f?.location?.$near);
    expect(nearFilter.location.$near.$maxDistance).toBeGreaterThan(0);
    expect(nearFilter.$and.some((c) => c.busy && c.busy.$ne === true)).toBe(true);
    /** H3 ran first and was empty; $near was the only candidate query. */
    expect(DriverLocation.distinct).toHaveBeenCalled();
  });

  test("12/13. matched driver with no live socket: dispatch is recorded failed, the ride stays searchable for pending recovery", async () => {
    rideModel.findById.mockReturnValue(queryReturning(ride));
    seedRows([{ id: "cap-offline", cell: pickupCell, recordedAt: new Date() }]);
    seedCaptainQueries({ h3Docs: [docAt("cap-offline", 0.001)], cityDocs: [] });
    driverRoomSocketIds.mockReturnValue([]);
    emitToCaptain.mockReturnValue(0);

    const dispatch = await rideController.startRideDispatch(ride._id);

    /** matched>0, delivered=0 → ride is NOT lost; it stays `searching`. */
    expect(dispatch).toEqual({ matched: 1, delivered: 0 });
    expect(recordDispatchAttemptSafe).toHaveBeenCalledWith(
      expect.objectContaining({ socketIds: [] }),
    );
    expect(
      logSpy.mock.calls.some(
        (c) =>
          c[0] === "[DISPATCH]" &&
          c[1].captainId === "cap-offline" &&
          c[1].socketCount === 0,
      ),
    ).toBe(true);
    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes("/rides/pending")),
    ).toBe(true);
  });
});
