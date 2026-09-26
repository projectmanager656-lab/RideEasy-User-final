const mongoose = require("mongoose");
const rideService = require("../services/rideCore.service");
const paymentService = require("../services/payment.service");
const { payRideFromWallet } = require("../services/wallet.service");
const { validateCoupon, reserveCoupon, releaseCoupon } = require("../services/coupon.service");
const ratingService = require("../services/rating.service");
const PaymentRecord = require("../models/paymentRecord.model");
const { getCaptainPricing } = require("../services/pricing.service");
const { validationResult } = require("express-validator");
const mapService = require("../services/maps.service");
const rideModel = require("../models/rideCore.model");
const captainModel = require("../models/captain.model");
const { decryptOtp, encryptOtp, hashOtp } = require("../utils/otpSecure");
const { expiresInMinutes, randomSixDigit } = require("../utils/otp");
const { fail, ok } = require("../utils/apiResponse");
const notificationService = require("../services/notification.service");
/** ONE canonical source for the scheduled-ride dispatch lead (also published to clients). */
const { getScheduledDispatchLeadMinutes } = require("../config/env");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const invoiceService = require("../services/invoice.service");
const refundService = require("../services/refund.service");
const RideShare = require("../models/rideShare.model");
const {
  isWithinServiceArea,
  inferServiceCityKeyOrNearest,
  ridePickupInServiceArea,
  logServiceAreaDistances,
  captainServingCityMatch,
  cityKey,
  SERVICE_AREA_ERROR,
} = require("../utils/serviceArea");

const {
  emitToUser,
  emitToCaptain,
  emitStandardRidePhase,
  driverRoomHyphen,
  driverRoomSocketIds,
} = require("../socket");
const {
  RIDE_REQUEST,
  RIDE_ACCEPTED,
  RIDE_STARTED,
  RIDE_COMPLETED,
} = require("../socket/rideSocket.events");
const {
  recordDispatchAttemptSafe,
  markRideDispatchesStatusSafe,
} = require("../services/rideDispatch.service");

/** Driver search radius in metres. Override with RIDE_SEARCH_RADIUS_M when testing locally. */
const RIDE_SEARCH_RADIUS_M = Number(process.env.RIDE_SEARCH_RADIUS_M || 5000);

/**
 * Turns the client's `scheduledAt` into the ONE authoritative pair of instants.
 * The client sends an absolute ISO-8601 instant (UTC), so no
 * browser-local string comparison or server-timezone guess is involved.
 */
function resolveScheduleWindow(raw) {
  if (raw == null || String(raw).trim() === "") {
    return { scheduledPickupAt: null, dispatchAt: null, isFutureSearch: false, leadMinutes: 0 };
  }
  const when = new Date(String(raw));
  if (Number.isNaN(when.getTime())) return { error: "Invalid scheduled pickup time" };
  if (when.getTime() <= Date.now()) {
    return { error: "Scheduled pickup time must be in the future" };
  }
  const leadMinutes = getScheduledDispatchLeadMinutes();
  const dispatchAt = new Date(when.getTime() - leadMinutes * 60 * 1000);
  return {
    scheduledPickupAt: when,
    dispatchAt,
    /**
     * Searching starts now only when the dispatch instant has already passed, i.e. the
     * chosen pickup is inside the lead window. The client uses the same rule (published
     * via GET /config/scheduling) so a time it offers is never dispatched instantly.
     */
    isFutureSearch: dispatchAt.getTime() > Date.now(),
    leadMinutes,
  };
}

/** Mongo match: subscription active and not past expiry (or no expiry set). */
function subscriptionNotExpiredMatch() {
  const now = new Date();
  return {
    subscriptionStatus: "active",
    $or: [
      { subscriptionExpiresAt: { $gt: now } },
      { subscriptionExpiresAt: null },
      { subscriptionExpiresAt: { $exists: false } },
    ],
  };
}

/** Ride matching uses the driver's later-onboarding vehicle type. */
function captainVehicleTypesForRide(vehicleType) {
  const norm = rideService.normalizeVehicleType(vehicleType);
  if (norm === "CAR") return ["CAR", "MINI", "SEDAN"];
  return [norm];
}
const USER_CANCEL_FEE_AFTER_ASSIGN_WINDOW_MS = 2 * 60 * 1000;
const USER_CANCEL_FEE_AFTER_ASSIGN = 10;
const USER_CANCEL_FEE_AFTER_ARRIVED = 25;

/** Active drivers accepting rides: status active + isOnline not explicitly false (legacy docs without field still match). */
function driverPresenceMatch() {
  return {
    status: "active",
    $or: [{ isOnline: true }, { isOnline: { $exists: false } }],
  };
}

async function captainWalletMatch() {
  const { minimumWalletBalance } = await getCaptainPricing();

  return {
    walletBalance: { $gte: minimumWalletBalance },
  };
}

function normalizeCity(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  if (v === "kolhapur") return "Kolhapur";
  if (v === "ichalkaranji") return "Ichalkaranji";
  if (v === "sangli") return "Sangli";
  return null;
}

function inferCityFromLocationText(...values) {
  const txt = values
    .filter(Boolean)
    .map((v) => String(v).toLowerCase())
    .join(" ");
  if (txt.includes("kolhapur")) return "Kolhapur";
  if (txt.includes("ichalkaranji")) return "Ichalkaranji";
  if (txt.includes("sangli")) return "Sangli";
  return null;
}

function normalizePaymentModeForLedger(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "upi") return "UPI";
  if (v === "online") return "Online";
  return "Cash";
}

/** Normalize populated or lean user/captain refs to a Mongo id string (avoids "[object Object]" on emit). */
function refToIdString(ref) {
  if (ref == null) return null;
  try {
    if (typeof ref === "string" || typeof ref === "number") return String(ref);
    if (typeof ref === "object" && ref._id != null) {
      return ref._id.toString();
    }
    return ref.toString();
  } catch {
    return null;
  }
}

function userIdOf(u) {
  return refToIdString(u);
}

function captainIdOf(c) {
  return refToIdString(c);
}

function shouldTrackDriverCancel(ride) {
  const st = String(ride?.status || "").toLowerCase();
  return st === "accepted" || st === "arrived";
}

async function applyDriverCancelPenalty(captainId) {
  if (!captainId) return null;
  const cap = await captainModel
    .findById(captainId)
    .select("driverCancelCount blocked");
  if (!cap) return null;
  const nextCount = Number(cap.driverCancelCount || 0) + 1;
  const patch = { driverCancelCount: nextCount };
  let warning = null;
  if (nextCount >= 5) {
    patch.blocked = true;
    patch.status = "inactive";
    patch.isOnline = false;
    warning = "Driver blocked after repeated ride cancellations.";
  } else if (nextCount >= 3) {
    patch.lastCancelWarningAt = new Date();
    warning = "Warning: 3 ride cancellations reached.";
  }
  await captainModel.updateOne({ _id: captainId }, { $set: patch });
  return { cancelCount: nextCount, warning, blocked: nextCount >= 5 };
}

function computeUserCancellationFee(ride) {
  const st = String(ride?.status || "").toLowerCase();
  if (st === "searching" || !ride?.captain) return 0;
  if (st === "arrived") return USER_CANCEL_FEE_AFTER_ARRIVED;
  if (st === "accepted") {
    const acceptedAt = ride.acceptedAt
      ? new Date(ride.acceptedAt).getTime()
      : NaN;
    if (
      Number.isFinite(acceptedAt) &&
      Date.now() - acceptedAt <= USER_CANCEL_FEE_AFTER_ASSIGN_WINDOW_MS
    ) {
      return USER_CANCEL_FEE_AFTER_ASSIGN;
    }
  }
  return USER_CANCEL_FEE_AFTER_ARRIVED;
}

/** Strip OTP material from ride objects sent over sockets or generic JSON. */
function publicRide(ride) {
  if (!ride) return ride;
  const o = ride.toObject ? ride.toObject({ virtuals: true }) : { ...ride };
  delete o.otpHash;
  delete o.otpCipher;
  delete o.otp;
  /* Server-side delivery bookkeeping — never part of the client ride contract. */
  delete o.offerAcks;
  return o;
}

const VEHICLE_TYPE_LABELS = {
  BIKE: "Bike",
  AUTO: "Auto rickshaw",
  CAR: "Car",
};

function vehicleModelFromType(t) {
  const k = rideService.normalizeVehicleType(t);
  return VEHICLE_TYPE_LABELS[k] || (t ? String(t) : "—");
}

function captainLiveLocation(captainDoc) {
  const c =
    captainDoc && typeof captainDoc.toObject === "function"
      ? captainDoc.toObject({ virtuals: true })
      : captainDoc;
  const coords = c?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) < 1e-5 && Math.abs(lng) < 1e-5) return null;
  return { lat, lng };
}

function driverRatingFromCaptain(c) {
  if (!c) return 0;
  const o =
    typeof c.toObject === "function" ? c.toObject({ virtuals: true }) : c;
  if (o.averageRating != null && Number.isFinite(Number(o.averageRating))) {
    return Number(o.averageRating);
  }
  if (o.ratingCount && o.ratingSum != null) {
    return Math.round((o.ratingSum / o.ratingCount) * 10) / 10;
  }
  return 0;
}

/**
 * Passenger-facing confirmation DTO (REST + Socket.IO).
 * @param {object} etaMeta - optional { etaMinutes, etaSeconds, eta }
 */
function buildPassengerConfirmation(ride, otpPlain, etaMeta = {}) {
  const safe = publicRide(ride);
  const c = ride?.captain;
  const co =
    c && typeof c.toObject === "function" ? c.toObject({ virtuals: true }) : c;
  const live = captainLiveLocation(c);
  const etaMinutes = etaMeta.etaMinutes != null ? etaMeta.etaMinutes : null;
  const etaSeconds = etaMeta.etaSeconds != null ? etaMeta.etaSeconds : null;
  const eta =
    etaMeta.eta != null
      ? etaMeta.eta
      : etaMinutes != null
        ? `${etaMinutes} min`
        : null;

  const vType = co?.vehicleType || safe.vehicleType || "";

  return {
    rideId: safe._id,
    driverName: co?.name || "",
    driverPhone: co?.phone || "",
    driverRating: driverRatingFromCaptain(c),
    vehicleType: vType,
    vehicleNumber: co?.vehicleNumber || "",
    vehicleModel: vehicleModelFromType(vType),
    liveLocation: live,
    eta,
    etaMinutes,
    etaSeconds,
    fare: safe.price != null ? Number(safe.price) : null,
    otp: otpPlain != null ? String(otpPlain) : undefined,
    rideStatus: safe.status || "",
  };
}

async function computeEtaCaptainToPickup(ride) {
  try {
    const c = ride?.captain;
    const pickup = ride?.pickup?.coordinates;
    if (!c || !pickup || pickup.length < 2) return {};
    const clng = c.location?.coordinates?.[0];
    const clat = c.location?.coordinates?.[1];
    const [plng, plat] = pickup;
    if (![clng, clat, plng, plat].every(Number.isFinite)) return {};
    if (Math.abs(clat) < 1e-5 && Math.abs(clng) < 1e-5) return {};
    const r = await mapService.getDrivingRoute(clng, clat, plng, plat, {
      overview: "false",
    });
    const sec = Math.round(Number(r.durationSec) || 0);
    const min = Math.max(1, Math.round(sec / 60));
    return { etaMinutes: min, etaSeconds: sec, eta: `${min} min` };
  } catch {
    return {};
  }
}

async function notifyPassengerAccepted(
  ride,
  otpPlain,
  prebuiltConfirmation = null,
) {
  const uid = userIdOf(ride.user);
  if (!uid) return;
  const safe = publicRide(ride);
  const confirmation =
    prebuiltConfirmation ||
    buildPassengerConfirmation(
      ride,
      otpPlain,
      await computeEtaCaptainToPickup(ride),
    );

  console.log(
    "[ride dispatch] rideAccepted ride=%s user=%s captain=%s",
    String(ride._id),
    uid,
    captainIdOf(ride.captain) || "none",
  );

  emitToUser(uid, RIDE_ACCEPTED, {
    ride: safe,
    confirmation,
    otp: confirmation.otp,
  });
  emitToUser(uid, "ride:status-update", {
    rideId: ride._id,
    status: "accepted",
    ride: safe,
    confirmation,
    driverLocation: confirmation.liveLocation || undefined,
  });

  const cid = captainIdOf(ride.captain);
  if (cid) {
    emitToCaptain(cid, RIDE_ACCEPTED, safe);
  }
}

async function findNearbyDriverIds({
  rideCity,
  vehicleType,
  pickupLng,
  pickupLat,
}) {
  if (pickupLng == null || pickupLat == null) return [];
  const cityMatch = captainServingCityMatch(rideCity);
  if (!cityMatch) return [];
  try {
    const drivers = await captainModel
      .find({
        /** `$and` keeps the subscription `$or` and the presence `$or` from clobbering each other. */
        $and: [
          { approved: true, blocked: { $ne: true } },
          subscriptionNotExpiredMatch(),
          driverPresenceMatch(),
          await captainWalletMatch(),
          cityMatch,
          { vehicleType: { $in: captainVehicleTypesForRide(vehicleType) } },
        ],
        location: {
          $near: {
            $geometry: { type: "Point", coordinates: [pickupLng, pickupLat] },
            $maxDistance: RIDE_SEARCH_RADIUS_M,
          },
        },
      })
      .limit(40)
      .select("_id");
    return drivers.map((d) => d._id.toString());
  } catch (e) {
    /* A missing 2dsphere index (fresh DB) must not fail ride creation — the city
       fallbacks and the connected-driver broadcast still run after this. */
    console.warn(
      "[ride dispatch] $near driver query failed (%s) — falling back to city matching",
      e?.message || e,
    );
    return [];
  }
}

/** When no one is within 5km (GPS mismatch / dev), still notify online drivers in same city + vehicle type. */
async function findCityFallbackDriverIds({ rideCity, vehicleType }) {
  const cityMatch = captainServingCityMatch(rideCity);
  if (!cityMatch) return [];
  const drivers = await captainModel
    .find({
      $and: [
        { approved: true, blocked: { $ne: true } },
        subscriptionNotExpiredMatch(),
        driverPresenceMatch(),
        await captainWalletMatch(),
        cityMatch,
        { vehicleType: { $in: captainVehicleTypesForRide(vehicleType) } },
      ],
    })
    .limit(40)
    .select("_id");
  return drivers.map((d) => d._id.toString());
}

/** Last resort: same city, any vehicle — avoids zero drivers when captain vehicle ≠ requested ride type (accept still allowed). */
async function findCityAnyVehicleDriverIds({ rideCity }) {
  const cityMatch = captainServingCityMatch(rideCity);
  if (!cityMatch) return [];
  const drivers = await captainModel
    .find({
      $and: [
        { approved: true, blocked: { $ne: true } },
        subscriptionNotExpiredMatch(),
        driverPresenceMatch(),
        await captainWalletMatch(),
        cityMatch,
      ],
    })
    .limit(40)
    .select("_id");
  return drivers.map((d) => d._id.toString());
}

async function countCaptainsMatching(...clauses) {
  const active = clauses.filter(Boolean);
  return captainModel.countDocuments(active.length ? { $and: active } : {});
}

/**
 * "Nobody matched" is otherwise invisible — ride stays `searching` with no clue why.
 * Counts how many captains survive each eligibility filter, in the same order the
 * matching queries apply them, and logs the funnel so the blocking filter is obvious.
 */
async function explainNoDrivers({ rideCity, vehicleType, pickupLng, pickupLat }) {
  const approved = { approved: true, blocked: { $ne: true } };
  const subscription = subscriptionNotExpiredMatch();
  const presence = driverPresenceMatch();
  const wallet = await captainWalletMatch();
  const city = captainServingCityMatch(rideCity);
  const vehicle = { vehicleType: { $in: captainVehicleTypesForRide(vehicleType) } };
  const geoWithin5km =
    pickupLng == null || pickupLat == null
      ? null
      : {
          location: {
            $geoWithin: {
              $centerSphere: [
                [pickupLng, pickupLat],
                RIDE_SEARCH_RADIUS_M / 6378100,
              ],
            },
          },
        };

  const funnel = {
    totalCaptains: await countCaptainsMatching(),
    approvedNotBlocked: await countCaptainsMatching(approved),
    subscriptionActive: await countCaptainsMatching(approved, subscription),
    activeOnline: await countCaptainsMatching(approved, subscription, presence),
    walletOk: await countCaptainsMatching(approved, subscription, presence, wallet),
    sameCity: await countCaptainsMatching(approved, subscription, presence, wallet, city),
    sameCityAndVehicle: await countCaptainsMatching(approved, subscription, presence, wallet, city, vehicle),
    within5km: geoWithin5km
      ? await countCaptainsMatching(approved, subscription, presence, wallet, city, vehicle, geoWithin5km)
      : null,
  };

  console.warn(
    "[ride dispatch] ZERO drivers matched for ride in %s (%s) — eligibility funnel:",
    rideCity,
    vehicleType,
    funnel,
  );
  return funnel;
}

/**
 * TEMP DIAGNOSTIC (ride-dispatch): dumps the ELIGIBLE driver pool with the city
 * comparison that gated it. The pool deliberately IGNORES the city filter, so a
 * city mismatch is visible — filtering by rideCity here would show nothing exactly
 * when the city is the reason nobody matched. Read-only; never logs credentials.
 * Remove once dispatch is confirmed.
 */
async function logDriverCandidates({ rideId, rideCity, vehicleType, pickupLng, pickupLat, eligibleDriverCount }) {
  try {
    const rideCityKey = cityKey(rideCity);
    const candidates = await captainModel
      .find({
        $and: [
          { approved: true, blocked: { $ne: true } },
          subscriptionNotExpiredMatch(),
          driverPresenceMatch(),
          await captainWalletMatch(),
        ],
      })
      .select(
        "name vehicleType servingCity status isOnline blocked approved subscriptionStatus subscriptionExpiresAt walletBalance socketId city location",
      )
      .lean();
    console.log("[ride dispatch]", {
      rideId: String(rideId),
      requestedVehicleType: vehicleType,
      pickupLat,
      pickupLng,
      city: rideCity,
      eligibleDriverCount,
      eligibleCandidateCount: candidates.length,
    });
    for (const d of candidates) {
      const driverCityKey = cityKey(d.servingCity);
      console.log("[ride dispatch] DRIVER CITY CHECK", {
        driverId: String(d._id),
        driverCity: d.servingCity,
        driverCityKey,
        rideCity,
        rideCityKey,
        sameCity: Boolean(driverCityKey && driverCityKey === rideCityKey),
      });
    }
  } catch (e) {
    console.warn("[ride dispatch] candidate dump failed (%s)", e?.message || e);
  }
}

/** Presence metadata only — never a delivery target. Logged to explain an offline match. */
async function driverPresenceFor(captainId) {
  try {
    const cap = await captainModel
      .findById(captainId)
      .select("socketId status isOnline busy")
      .lean();
    return {
      socketId: cap?.socketId || null,
      status: cap?.status ?? null,
      isOnline: cap?.isOnline ?? null,
    };
  } catch {
    return { socketId: null, status: null, isOnline: null };
  }
}

/**
 * Deliver the ride offer to each MATCHED driver's own `driver-<id>` room.
 *
 * The Socket.IO adapter room is the ONLY authoritative "is this driver connected"
 * check — a stored `captain.socketId` is presence metadata and is never used as the
 * delivery target (a stale id makes the emit look successful while nothing arrives).
 * `delivered` counts the matched drivers whose room actually received the frame, so
 * `matched=1 delivered=0` truthfully means the matched driver has no live socket.
 *
 * There is deliberately NO fallback broadcast to every connected driver: that would
 * offer a matched ride to drivers the matching rules excluded. An undelivered ride
 * stays `searching` and is recovered by the driver's `/rides/pending` poll and by
 * `emitJoinCatchUp` on reconnect.
 */
async function broadcastRideNew(rideDoc, driverIds) {
  const ride = publicRide(rideDoc);
  const offeredAt = Date.now();
  const payload = { ride, offeredAt };
  const rid = ride?._id != null ? String(ride._id) : "";
  if (!driverIds.length) {
    console.warn(
      "[ride dispatch] ZERO drivers matched for ride %s (check city, isOnline, subscription, vehicle)",
      rid,
    );
    return { matched: 0, delivered: 0 };
  }
  let delivered = 0;
  for (const id of driverIds) {
    const captainId = String(id);
    const roomName = driverRoomHyphen(captainId);
    /** Presence from the matched Captain document — diagnostic only, never the target. */
    const presence = await driverPresenceFor(id);
    console.log("[DISPATCH DEBUG] MATCHED DRIVER", {
      rideId: rid,
      captainId,
      driverSocketIdFromDB: presence.socketId,
      driverStatus: presence.status,
      driverIsOnline: presence.isOnline,
    });
    const roomSocketIds = driverRoomSocketIds(id);
    /**
     * THE decisive check: matched=1 with socketCount=0 means the matched driver has no
     * live socket in its room (registration/reconnect issue OR the driver is genuinely
     * offline). matched=1 with socketCount>0 means delivery should succeed.
     */
    console.log("[DISPATCH DEBUG] LIVE DRIVER ROOM", {
      captainId,
      roomName,
      socketCount: roomSocketIds.length,
      socketIds: roomSocketIds,
    });
    /* `emitToCaptain` targets the live room and returns the live socket count. */
    const socketCount = emitToCaptain(id, RIDE_REQUEST, payload);
    console.log("[ride dispatch] room check", { rideId: rid, roomName, socketCount });
    /**
     * Durable per-(ride, captain) record of what the attempt actually did. Live room
     * membership is the only honest "delivered" signal — recorded here so a matched
     * driver with no live socket is `failed`, never falsely `delivered`.
     */
    recordDispatchAttemptSafe({ rideId: rid, captainId, roomName, socketIds: roomSocketIds });
    if (socketCount > 0) {
      delivered += 1;
      console.log("[ride dispatch] socket offer sent", { rideId: rid, captainId, roomName, socketCount });
      emitToCaptain(id, "new-ride", payload);
      continue;
    }
    console.warn("[ride dispatch] DRIVER SOCKET OFFLINE", {
      rideId: rid,
      captainId,
      roomName,
      storedSocketId: presence.socketId,
      driverIsOnline: presence.isOnline,
    });
  }
  console.log(
    "[ride dispatch] ride=%s city=%s matched=%d delivered=%d offline=%d targetDrivers=%s",
    rid,
    rideDoc?.city || ride?.city || "",
    driverIds.length,
    delivered,
    driverIds.length - delivered,
    driverIds.join(","),
  );
  return { matched: driverIds.length, delivered };
}

/** Offer a searching ride to the matched drivers (no global broadcast fallback). */
async function offerRideToDrivers(rideDoc, driverIds) {
  const dispatch = await broadcastRideNew(rideDoc, driverIds);
  if (dispatch.delivered === 0 && dispatch.matched > 0) {
    console.warn(
      "[ride dispatch] ride %s matched %d driver(s) but no live driver socket received it — the ride stays `searching` and is recoverable by the driver's /rides/pending poll and by emitJoinCatchUp on reconnect",
      String(rideDoc?._id ?? ""),
      dispatch.matched,
    );
  }
  return dispatch;
}

function mergeUniqueIds(...lists) {
  return [
    ...new Set(
      lists
        .flat()
        .filter(Boolean)
        .map((x) => String(x)),
    ),
  ];
}

/**
 * Runs the existing driver-search + offer broadcast for a ride that is already in
 * `searching`. Shared by Book Now and the scheduled-ride dispatcher so there is
 * exactly ONE matching implementation (no duplicated algorithm).
 */
async function startRideDispatch(rideOrId) {
  const rideId = rideOrId?._id != null ? rideOrId._id : rideOrId;
  const populated = await rideModel
    .findById(rideId)
    .populate("user")
    .populate("captain");
  if (!populated) return { matched: 0, delivered: 0, skipped: "ride_not_found" };

  const pickupLng = populated.pickup?.coordinates?.[0];
  const pickupLat = populated.pickup?.coordinates?.[1];
  if (!Number.isFinite(pickupLng) || !Number.isFinite(pickupLat)) {
    console.warn("[ride dispatch] ride %s has no pickup coordinates — cannot match drivers", String(rideId));
    return { matched: 0, delivered: 0, skipped: "missing_pickup_coordinates" };
  }

  const rideCity = populated.city;
  const nearbyDriverIds = await findNearbyDriverIds({
    rideCity,
    vehicleType: populated.vehicleType,
    pickupLng,
    pickupLat,
  });
  const cityDriverIds = await findCityFallbackDriverIds({
    rideCity,
    vehicleType: populated.vehicleType,
  });
  let driverIds = mergeUniqueIds(nearbyDriverIds, cityDriverIds);
  if (driverIds.length === 0) {
    driverIds = await findCityAnyVehicleDriverIds({ rideCity });
  }
  console.log(
    "[ride dispatch] ride=%s city=%s vehicle=%s pickup=%s,%s nearby5km=%d citySameVehicle=%d total=%d",
    String(rideId),
    rideCity,
    populated.vehicleType,
    pickupLat,
    pickupLng,
    nearbyDriverIds.length,
    cityDriverIds.length,
    driverIds.length,
  );
  if (driverIds.length === 0) {
    await explainNoDrivers({
      rideCity,
      vehicleType: populated.vehicleType,
      pickupLng,
      pickupLat,
    });
    await logDriverCandidates({
      rideId,
      rideCity,
      vehicleType: populated.vehicleType,
      pickupLng,
      pickupLat,
      eligibleDriverCount: driverIds.length,
    });
  }
  /**
   * The eligibility query can match drivers that have no live socket (stale online
   * flags are kept deliberately so `/rides/pending` keeps working). `offerRideToDrivers`
   * reports that truthfully instead of pretending the offer was delivered.
   */
  return await offerRideToDrivers(populated, driverIds);
}

module.exports.startRideDispatch = startRideDispatch;

module.exports.createRide = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return fail(res, req, 400, "Validation failed", { errors: errors.array() });
  }

  const {
    pickupLocation,
    dropLocation,
    vehicleType,
    paymentMethod,
    customerName,
    customerPhone,
    couponCode,
  } = req.body;

  try {
    const pl = Number(req.body.pickupLat);
    const plng = Number(req.body.pickupLng);
    const dl = Number(req.body.dropLat);
    const dlng = Number(req.body.dropLng);
    const hasFullClientCoords = [pl, plng, dl, dlng].every(Number.isFinite);

    let pickupCoordinates;
    let dropCoordinates;
    if (hasFullClientCoords) {
      pickupCoordinates = { lat: pl, lng: plng };
      dropCoordinates = { lat: dl, lng: dlng };
    } else {
      pickupCoordinates = await mapService.getAddressCoordinate(pickupLocation);
      dropCoordinates = await mapService.getAddressCoordinate(dropLocation);
    }

    const pickupInArea = isWithinServiceArea(
      pickupCoordinates.lat,
      pickupCoordinates.lng,
    );
    const dropInArea = isWithinServiceArea(
      dropCoordinates.lat,
      dropCoordinates.lng,
    );

    if (hasFullClientCoords) {
      if (!pickupInArea) {
        logServiceAreaDistances(
          "createRide pickup (client coords, outside strict zone — allowed)",
          pickupCoordinates.lat,
          pickupCoordinates.lng,
        );
      }
      if (!dropInArea) {
        logServiceAreaDistances(
          "createRide drop (client coords, outside strict zone — allowed)",
          dropCoordinates.lat,
          dropCoordinates.lng,
        );
      }
    } else if (!pickupInArea || !dropInArea) {
      if (!pickupInArea) {
        logServiceAreaDistances(
          "createRide pickup rejected",
          pickupCoordinates.lat,
          pickupCoordinates.lng,
        );
      }
      if (!dropInArea) {
        logServiceAreaDistances(
          "createRide drop rejected",
          dropCoordinates.lat,
          dropCoordinates.lng,
        );
      }
      return fail(res, req, 400, SERVICE_AREA_ERROR);
    }

    const rideCity = inferServiceCityKeyOrNearest(
      pickupCoordinates.lat,
      pickupCoordinates.lng,
    );

    const fareCoordOpts = hasFullClientCoords
      ? { pickupCoord: pickupCoordinates, dropCoord: dropCoordinates }
      : null;
    const farePayload = await rideService.getFare(
      pickupLocation,
      dropLocation,
      fareCoordOpts,
    );
    const vehicleTypeNorm = rideService.normalizeVehicleType(
      vehicleType || req.body.vehicleType,
    );
    if (!["BIKE", "AUTO", "CAR"].includes(vehicleTypeNorm)) {
      return fail(res, req, 400, "Invalid vehicle type");
    }
    const computedPrice = Number(farePayload?.[vehicleTypeNorm]);
    if (!Number.isFinite(computedPrice) || computedPrice <= 0) {
      return fail(res, req, 400, "Could not compute fare for selected vehicle");
    }
    const computedDistanceKm = Number(farePayload?.distanceKm);
    if (!Number.isFinite(computedDistanceKm) || computedDistanceKm <= 0) {
      return fail(res, req, 400, "Distance must be greater than 0");
    }

    const couponResult = await validateCoupon({ code: couponCode, userId: req.user._id, fare: computedPrice });

    /* A future booking is only reserved — it must NOT search for a driver yet. */
    const scheduleWindow = resolveScheduleWindow(req.body?.scheduledAt);
    if (scheduleWindow.error) {
      return fail(res, req, 400, scheduleWindow.error);
    }
    const isScheduledBooking = scheduleWindow.isFutureSearch === true;

    const { ride } = await rideService.createRide({
      user: req.user._id,
      pickupLocation,
      dropLocation,
      city: rideCity,
      vehicleType: vehicleTypeNorm,
      paymentMethod,
      price: computedPrice,
      discountAmount: couponResult.discountAmount,
      discountReason: couponResult.coupon?.code || '',
      couponCode: couponResult.coupon?.code || '',
      couponName: couponResult.coupon?.title || couponResult.coupon?.code || '',
      distanceKm: computedDistanceKm,
      customerName: customerName || req.user.name,
      customerPhone: customerPhone || req.user.phone,
      pickupCoordinates,
      dropCoordinates,
      bookingType: isScheduledBooking ? 'scheduled' : 'now',
      scheduledPickupAt: scheduleWindow.scheduledPickupAt,
      dispatchAt: scheduleWindow.dispatchAt,
    });

    // Reserve the coupon for this user now (unique per coupon+user) so it can never
    // be redeemed twice. `usedCount` is still incremented only after payment.
    if (couponResult.coupon) {
      try {
        await reserveCoupon({
          coupon: couponResult.coupon,
          userId: req.user._id,
          rideId: ride._id,
          discountAmount: couponResult.discountAmount,
          excessDiscount: couponResult.excessDiscount || 0,
        });
      } catch (err) {
        // Coupon was claimed by another booking in the meantime — abort this ride.
        await rideModel.deleteOne({ _id: ride._id });
        return fail(res, req, err.statusCode || 400, err.message || "Coupon could not be applied");
      }
    }

    /**
     * SCHEDULED booking: reserve only. No driver search, no matching, no
     * `searching` status and no searching events — the backend scheduler does
     * that at dispatch time (see services/scheduledRide.service.js).
     */
    if (isScheduledBooking) {
      const scheduledRide = await rideModel
        .findById(ride._id)
        .populate("user")
        .populate("captain");
      const schedUid = userIdOf(req.user);
      if (schedUid) {
        emitToUser(schedUid, "ride:status-update", {
          rideId: ride._id,
          status: "scheduled",
          ride: publicRide(scheduledRide),
        });
      }
      console.log(
        "[createRide] ride=%s SCHEDULED pickup=%s dispatchAt=%s lead=%dmin",
        String(ride._id),
        scheduledRide.scheduledPickupAt?.toISOString?.() || "",
        scheduledRide.dispatchAt?.toISOString?.() || "",
        scheduleWindow.leadMinutes,
      );
      /**
       * Exactly ONE schedule-confirmation notification, created from this
       * authoritative booking event (never from frontend rendering). The client
       * renders the passenger's LOCAL pickup time from `meta.scheduledPickupAt`,
       * since the server cannot know the device timezone.
       */
      if (schedUid) {
        await notificationService.notifyRidePersist(
          schedUid,
          "user",
          "Ride scheduled",
          "Your ride has been scheduled.",
          {
            rideId: String(ride._id),
            rideStatus: "scheduled",
            source: "scheduled_booking",
            scheduledPickupAt: scheduledRide.scheduledPickupAt,
          },
        );
      }
      return ok(
        res,
        req,
        201,
        "Ride scheduled",
        {
          ride: publicRide(scheduledRide),
          scheduled: true,
          scheduledPickupAt: scheduledRide.scheduledPickupAt,
          dispatchAt: scheduledRide.dispatchAt,
          dispatchLeadMinutes: scheduleWindow.leadMinutes,
        },
        { includeFlatData: false },
      );
    }

    const uid = userIdOf(req.user);
    emitToUser(uid, "ride:status-update", {
      rideId: ride._id,
      status: "searching",
    });

    const populated = await rideModel
      .findById(ride._id)
      .populate("user")
      .populate("captain");
    const dispatch = await startRideDispatch(ride._id);
    return ok(
      res,
      req,
      201,
      "Ride created — OTP is shown after the driver arrives",
      { ride: publicRide(populated), dispatch },
      { includeFlatData: false },
    );
  } catch (err) {
    console.error(err);
    return fail(res, req, err.statusCode || 500, err.message || "Failed to create ride");
  }
};

module.exports.retryAssign = async (req, res) => {
  const rideId = req.params.id;
  try {
    const ride = await rideModel
      .findById(rideId)
      .populate("user")
      .populate("captain");
    if (!ride) return fail(res, req, 404, "Ride not found");
    const ownerId = ride.user?._id || ride.user;
    if (!ownerId || !ownerId.equals(req.user._id))
      return fail(res, req, 403, "Forbidden");
    if (ride.status !== "searching")
      return res.status(200).json({
        ...publicRide(ride),
        ok: true,
        message: "Ride not in searching state",
        requestId: req.requestId,
      });

    const pickupLng = ride.pickup?.coordinates?.[0];
    const pickupLat = ride.pickup?.coordinates?.[1];
    if (pickupLng == null || pickupLat == null) {
      return fail(res, req, 400, "Pickup coordinates missing");
    }

    const hasCaptain =
      ride.captain && String(ride.captain._id || ride.captain) !== "";
    if (hasCaptain)
      return res.status(200).json({
        ...publicRide(ride),
        ok: true,
        message: "Ride already assigned",
        requestId: req.requestId,
      });

    const nearbyDriverIds = await findNearbyDriverIds({
      rideCity: ride.city,
      vehicleType: ride.vehicleType,
      pickupLng,
      pickupLat,
    });
    const cityDriverIds = await findCityFallbackDriverIds({
      rideCity: ride.city,
      vehicleType: ride.vehicleType,
    });
    let driverIds = mergeUniqueIds(nearbyDriverIds, cityDriverIds);
    if (driverIds.length === 0) {
      driverIds = await findCityAnyVehicleDriverIds({ rideCity: ride.city });
    }
    await offerRideToDrivers(ride, driverIds);
    return res.status(200).json({
      ...publicRide(ride),
      ok: true,
      message: "Retry assign triggered",
      requestId: req.requestId,
    });
  } catch (err) {
    return fail(res, req, 500, err.message || "Retry assign failed");
  }
};

module.exports.getFare = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return fail(res, req, 400, "Validation failed", { errors: errors.array() });
  }

  const pickup = (req.query.pickup || req.query.pickupLocation || "")
    .toString()
    .trim();
  const destination = (req.query.destination || req.query.dropLocation || "")
    .toString()
    .trim();

  if (!pickup || !destination) {
    return fail(res, req, 400, "Pickup and destination are required");
  }

  try {
    const pl = Number(req.query.pickupLat);
    const plng = Number(req.query.pickupLng);
    const dl = Number(req.query.dropLat);
    const dlng = Number(req.query.dropLng);
    /** All four coordinates or none — a partial set is a client bug, not a reason to crash. */
    const coordsPresent = [pl, plng, dl, dlng].filter(Number.isFinite).length;
    if (coordsPresent > 0 && coordsPresent < 4) {
      return fail(
        res,
        req,
        400,
        "Provide all four coordinates (pickupLat, pickupLng, dropLat, dropLng) or none",
      );
    }
    const hasFullClientCoords = coordsPresent === 4;

    let pickupCoord;
    let dropCoord;
    if (hasFullClientCoords) {
      pickupCoord = { lat: pl, lng: plng };
      dropCoord = { lat: dl, lng: dlng };
    } else {
      pickupCoord = await mapService.getAddressCoordinate(pickup);
      dropCoord = await mapService.getAddressCoordinate(destination);
    }

    const farePickupOk = isWithinServiceArea(pickupCoord.lat, pickupCoord.lng);
    const fareDropOk = isWithinServiceArea(dropCoord.lat, dropCoord.lng);

    if (hasFullClientCoords) {
      if (!farePickupOk) {
        logServiceAreaDistances(
          "getFare pickup (client coords, outside strict zone — allowed)",
          pickupCoord.lat,
          pickupCoord.lng,
        );
      }
      if (!fareDropOk) {
        logServiceAreaDistances(
          "getFare drop (client coords, outside strict zone — allowed)",
          dropCoord.lat,
          dropCoord.lng,
        );
      }
    } else if (!farePickupOk || !fareDropOk) {
      if (!farePickupOk) {
        logServiceAreaDistances(
          "getFare pickup rejected",
          pickupCoord.lat,
          pickupCoord.lng,
        );
      }
      if (!fareDropOk) {
        logServiceAreaDistances(
          "getFare drop rejected",
          dropCoord.lat,
          dropCoord.lng,
        );
      }
      return fail(res, req, 400, SERVICE_AREA_ERROR);
    }

    const fareCoordOpts = hasFullClientCoords
      ? { pickupCoord, dropCoord }
      : null;
    const fare = await rideService.getFare(pickup, destination, fareCoordOpts);
    return res.status(200).json({
      ...fare,
      ok: true,
      message: "Fare fetched",
      requestId: req.requestId,
    });
  } catch (err) {
    const status = Number(err.statusCode) || 500;
    if (status >= 500) {
      console.error("[getFare] upstream failure:", err?.message || err);
      return fail(res, req, status, "Unable to fetch fare right now. Please try again.");
    }
    return fail(res, req, status, err.message || "Failed to get fare");
  }
};

module.exports.checkServiceArea = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return fail(res, req, 400, "Validation failed", { errors: errors.array() });
  }
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const within = isWithinServiceArea(lat, lng);
  if (!within) {
    logServiceAreaDistances("checkServiceArea rejected", lat, lng);
  }
  return res.status(200).json({
    ok: true,
    within,
    message: within ? "In service area" : SERVICE_AREA_ERROR,
    requestId: req.requestId,
  });
};

module.exports.confirmRide = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return fail(res, req, 400, "Validation failed", { errors: errors.array() });
  }

  const { rideId } = req.body;

  try {
    const { ride } = await rideService.confirmRide({
      rideId,
      captain: req.captain,
    });
    const full = await rideModel
      .findById(ride._id)
      .populate("user")
      .populate("captain");
    const etaMeta = await computeEtaCaptainToPickup(full);
    const confirmation = buildPassengerConfirmation(full, null, etaMeta);
    await notifyPassengerAccepted(full, null, confirmation);
    return res.status(200).json({
      ...publicRide(full),
      confirmation,
      ok: true,
      message: "Ride accepted",
      requestId: req.requestId,
    });
  } catch (err) {
    console.error(err);
    return fail(
      res,
      req,
      err.statusCode || 500,
      err.message || "Failed to confirm ride",
    );
  }
};

module.exports.arriveRide = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { rideId } = req.body;

  try {
    const { ride, otpPlain } = await rideService.markArrived({
      rideId,
      captain: req.captain,
    });

    const full = await rideModel
      .findById(ride._id)
      .populate("user")
      .populate("captain");

    const etaMeta = await computeEtaCaptainToPickup(full);

    const confirmation = buildPassengerConfirmation(full, otpPlain, etaMeta);

    const uid = userIdOf(ride.user);

    if (uid) {
      emitToUser(uid, "ride:status-update", {
        rideId: ride._id,
        status: ride.status,
        ride: publicRide(full),
        confirmation,
        driverLocation: confirmation.liveLocation || undefined,
      });
    }

    return res.status(200).json({
      ...publicRide(full),
      ...(otpPlain ? { otp: String(otpPlain) } : {}),
      confirmation,
      ok: true,
      message: "Driver marked arrived",
      requestId: req.requestId,
    });
  } catch (err) {
    return fail(
      res,
      req,
      err.statusCode || 500,
      err.message || "Failed to mark arrived",
    );
  }
};

module.exports.acceptRide = async (req, res) => {
  const rideId = req.params.id;
  if (!rideId) {
    return fail(res, req, 400, "Ride id is required");
  }

  try {
    await rideService.releaseCaptainBusyIfAvailable(req.captain._id);
    const cap = await captainModel
      .findById(req.captain._id)
      .select(
        "subscriptionStatus subscriptionExpiresAt blocked approved status isOnline walletBalance busy",
      )
      .lean();
    if (!cap || cap.blocked) return fail(res, req, 403, "Account blocked");
    if (cap.busy) {
      return fail(res, req, 409, "Captain already has an active ride.");
    }
    if (cap.subscriptionStatus !== "active")
      return fail(res, req, 403, "Plan expired. Renew to accept rides.");
    if (
      cap.subscriptionExpiresAt &&
      new Date(cap.subscriptionExpiresAt) <= new Date()
    ) {
      await captainModel.updateOne(
        { _id: req.captain._id },
        {
          $set: {
            subscriptionStatus: "expired",
            status: "inactive",
            isOnline: false,
          },
        },
      );
      return fail(res, req, 403, "Plan expired. Renew to accept rides.");
    }
    const { minimumWalletBalance } = await getCaptainPricing();
    const walletBalance = Number(cap.walletBalance || 0);
    const minimumBalance = Number(minimumWalletBalance || 0);
    if (walletBalance < minimumBalance) {
      return fail(
        res,
        req,
        403,
        "Insufficient wallet balance. Add money to accept rides.",
      );
    }
    const { ride } = await rideService.confirmRide({
      rideId,
      captain: req.captain,
    });
    const full = await rideModel
      .findById(ride._id)
      .populate("user")
      .populate("captain");
    const etaMeta = await computeEtaCaptainToPickup(full);
    const confirmation = buildPassengerConfirmation(full, null, etaMeta);
    await notifyPassengerAccepted(full, null, confirmation);
    return res.status(200).json({
      ...publicRide(full),
      confirmation,
      ok: true,
      message: "Ride accepted",
      requestId: req.requestId,
    });
  } catch (err) {
    console.error(err);
    return fail(
      res,
      req,
      err.statusCode || 400,
      err.message || "Failed to accept ride",
    );
  }
};

module.exports.rejectRide = async (req, res) => {
  const rideId = req.params.id;
  if (!rideId) return fail(res, req, 400, "Ride id is required");
  try {
    const ride = await rideService.rejectRide({ rideId, captain: req.captain });
    const uid = userIdOf(ride.user);
    if (uid) {
      emitToUser(uid, "ride:status-update", {
        rideId: ride._id,
        status: "searching",
        captainUnassigned: true,
        message: "A driver declined — still searching",
      });
    }
    return res.status(200).json({
      ...publicRide(ride),
      ok: true,
      message: "Ride rejected",
      requestId: req.requestId,
    });
  } catch (err) {
    return fail(
      res,
      req,
      err.statusCode || 400,
      err.message || "Failed to reject ride",
    );
  }
};

module.exports.cancelRideByUser = async (req, res) => {
  const rideId = req.params.id;
  if (!rideId) return fail(res, req, 400, "Ride id is required");
  try {
    const ride = await rideModel
      .findById(rideId)
      .populate("user")
      .populate("captain");
    if (!ride) return fail(res, req, 404, "Ride not found");
    const ownerId = userIdOf(ride.user);
    if (!ownerId || ownerId !== userIdOf(req.user))
      return fail(res, req, 403, "Forbidden");
    const st = String(ride.status || "").toLowerCase();
    /** `scheduled` = reserved future booking; cancelling it must stop the scheduler dispatching it. */
    if (!["scheduled", "searching", "accepted", "arrived"].includes(st)) {
      return fail(res, req, 409, "Ride cannot be cancelled at this stage");
    }
    const fee = computeUserCancellationFee(ride);
    const patch = {
      status: "cancelled",
      cancelledBy: "user",
      cancellationFee: fee,
      cancelledAt: new Date(),
      cancellationReason: String(req.body?.reason || "").slice(0, 240),
    };
    await rideModel.updateOne({ _id: ride._id }, { $set: patch });
    // The ride never happened, so free any coupon reserved for it (no-op when settled).
    await releaseCoupon({ rideId: ride._id });
    await rideService.releaseCaptainBusyIfAvailable(ride.captain);
    markRideDispatchesStatusSafe(ride._id, "cancelled");
    const finalRide = await rideModel
      .findById(ride._id)
      .populate("user")
      .populate("captain");
    const uid = userIdOf(finalRide.user);
    const cid = captainIdOf(finalRide.captain);
    const payload = {
      rideId: finalRide._id,
      status: "cancelled",
      ride: publicRide(finalRide),
      cancellationFee: fee,
      cancelledBy: "user",
    };
    if (uid) emitToUser(uid, "ride:status-update", payload);
    if (cid) emitToCaptain(cid, "ride:status-update", payload);
    return ok(
      res,
      req,
      200,
      fee > 0
        ? `Ride cancelled. Cancellation fee ₹${fee} applies.`
        : "Ride cancelled (no fee).",
      {
        ride: publicRide(finalRide),
        cancellationFee: fee,
        cancelledBy: "user",
      },
    );
  } catch (err) {
    return fail(res, req, 500, err.message || "Failed to cancel ride");
  }
};

module.exports.cancelRideByCaptain = async (req, res) => {
  const rideId = req.params.id;
  if (!rideId) return fail(res, req, 400, "Ride id is required");
  try {
    let ride = await rideModel
      .findById(rideId)
      .populate("user")
      .populate("captain");
    if (!ride) return fail(res, req, 404, "Ride not found");
    const cid = captainIdOf(ride.captain);
    if (!cid || cid !== captainIdOf(req.captain))
      return fail(res, req, 403, "Forbidden");
    const st = String(ride.status || "").toLowerCase();
    if (!["accepted", "arrived"].includes(st)) {
      return fail(
        res,
        req,
        409,
        "Only assigned rides can be cancelled by driver",
      );
    }
    await rideModel.updateOne(
      { _id: ride._id },
      {
        $set: {
          status: "cancelled",
          cancelledBy: "captain",
          cancellationFee: 0,
          cancelledAt: new Date(),
          cancellationReason: String(req.body?.reason || "").slice(0, 240),
        },
      },
    );
    // The ride never happened, so free any coupon reserved for it (no-op when settled).
    await releaseCoupon({ rideId: ride._id });
    await rideService.releaseCaptainBusyIfAvailable(ride.captain);
    markRideDispatchesStatusSafe(ride._id, "cancelled");
    const penalty = shouldTrackDriverCancel(ride)
      ? await applyDriverCancelPenalty(captainIdOf(req.captain))
      : null;
    ride = await rideModel
      .findById(ride._id)
      .populate("user")
      .populate("captain");
    const uid = userIdOf(ride.user);
    const payload = {
      rideId: ride._id,
      status: "cancelled",
      ride: publicRide(ride),
      cancelledBy: "captain",
      cancellationFee: 0,
      driverCancelCount: penalty?.cancelCount,
      driverBlocked: penalty?.blocked || false,
    };
    if (uid) emitToUser(uid, "ride:status-update", payload);
    if (cid) emitToCaptain(cid, "ride:status-update", payload);
    const message = penalty?.warning
      ? `Ride cancelled. ${penalty.warning}`
      : "Ride cancelled by driver";
    return ok(res, req, 200, message, {
      ride: publicRide(ride),
      driverCancelCount: penalty?.cancelCount || 0,
      driverBlocked: penalty?.blocked || false,
    });
  } catch (err) {
    return fail(res, req, 500, err.message || "Failed to cancel ride");
  }
};

module.exports.getRideById = async (req, res) => {
  const rideId = req.params.id;
  if (!rideId) {
    return fail(res, req, 400, "Ride id is required");
  }

  try {
    const ride = await rideModel
      .findById(rideId)
      .populate("user", "name phone email walletBalance")
      .populate("captain");

    if (!ride) {
      return fail(res, req, 404, "Ride not found");
    }

    const ownerId = userIdOf(ride.user);
    const assignedCaptainId = captainIdOf(ride.captain);
    const requestUserId = req.user ? userIdOf(req.user) : null;
    const requestCaptainId = req.captain ? captainIdOf(req.captain) : null;
    const isPassenger = Boolean(
      ownerId && requestUserId && ownerId === requestUserId,
    );
    const isAssignedCaptain = Boolean(
      assignedCaptainId &&
      requestCaptainId &&
      assignedCaptainId === requestCaptainId,
    );
    if (!isPassenger && !isAssignedCaptain) {
      return fail(res, req, 403, "Forbidden");
    }

    let otpPlain = null;
    if (
      ride.status === "arrived" &&
      (isPassenger || isAssignedCaptain)
    ) {
      const withCipher = await rideModel.findById(rideId).select("+otpCipher");
      if (withCipher?.otpCipher) {
        try {
          otpPlain = decryptOtp(withCipher.otpCipher);
        } catch (e) {
          console.error(
            "[getRideById] OTP decrypt failed",
            String(rideId),
            e?.message || e,
          );
        }
      }
    }

    const confirmation = buildPassengerConfirmation(
      ride,
      otpPlain,
      await computeEtaCaptainToPickup(ride),
    );

    return res.status(200).json({
      ...publicRide(ride),
      ...(otpPlain ? { otp: String(otpPlain) } : {}),
      confirmation,
      ok: true,
      message: "Ride fetched",
      requestId: req.requestId,
    });
  } catch (err) {
    return fail(res, req, 500, err.message || "Failed to fetch ride");
  }
};

/** Passenger-only: OTP never emitted on sockets. */
module.exports.getPassengerOtp = async (req, res) => {
  const rideId = req.params.id;
  if (!mongoose.isValidObjectId(rideId)) {
    return res.status(400).json({ message: "Invalid ride id" });
  }
  try {
    const ride = await rideModel
      .findById(rideId)
      .select("+otpCipher")
      .populate("captain");
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    const ownerId = userIdOf(ride.user);
    if (!ownerId || ownerId !== userIdOf(req.user)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (ride.status !== "accepted" && ride.status !== "arrived") {
      return res.status(400).json({
        message: "OTP is available after the driver accepts or arrives",
      });
    }

    const hasValidOtpWindow =
      ride.otpExpiresAt && new Date(ride.otpExpiresAt).getTime() > Date.now();

    let otp = null;
    if (hasValidOtpWindow) {
      if (!ride.otpCipher) {
        return res.status(400).json({ message: "OTP not ready yet" });
      }
      try {
        otp = decryptOtp(ride.otpCipher);
      } catch (e) {
        console.error(
          "[getPassengerOtp] decrypt failed",
          String(rideId),
          e?.message || e,
        );
        return res.status(500).json({ message: "OTP unavailable" });
      }
      if (!otp) return res.status(500).json({ message: "OTP unavailable" });
    } else {
      const plain = randomSixDigit();
      const otpHash = await hashOtp(plain);
      const otpCipher = encryptOtp(plain);
      const otpExpiresAt = expiresInMinutes(5);

      await rideModel.updateOne(
        { _id: ride._id },
        {
          $set: {
            otpHash,
            otpCipher,
            otpExpiresAt,
          },
        },
      );
      otp = plain;
      ride.otpCipher = otpCipher;
      ride.otpExpiresAt = otpExpiresAt;
    }

    const etaMeta = await computeEtaCaptainToPickup(ride);
    const confirmation = buildPassengerConfirmation(ride, otp, etaMeta);
    return res.json({
      ok: true,
      otp,
      expiresAt: ride.otpExpiresAt,
      confirmation,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports.startRide = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { rideId, otp } = req.query;

  try {
    const ride = await rideService.startRide({
      rideId,
      otp,
      captain: req.captain,
    });
    const pr = publicRide(ride);
    const etaMeta = await computeEtaCaptainToPickup(ride);
    const confirmation = buildPassengerConfirmation(ride, null, etaMeta);
    confirmation.rideStatus = "started";
    delete confirmation.otp;
    const uid = userIdOf(ride.user);
    const cid = captainIdOf(ride.captain);
    console.log(
      "[ride dispatch] rideStarted ride=%s user=%s captain=%s",
      String(ride._id),
      uid || "none",
      cid || "none",
    );
    const startedPayload = { rideId: ride._id, ride: pr, confirmation };
    if (uid) {
      emitToUser(uid, RIDE_STARTED, startedPayload);
      emitToUser(uid, "ride:status-update", {
        rideId: ride._id,
        status: "started",
        ride: pr,
        confirmation,
        driverLocation: confirmation.liveLocation || undefined,
      });
    }
    if (cid) {
      emitToCaptain(cid, RIDE_STARTED, { rideId: ride._id, ride: pr });
    }
    return res.status(200).json({ ...pr, confirmation });
  } catch (err) {
    const code = Number(err.statusCode) || 400;
    return res
      .status(code)
      .json({ message: err.message || "Start ride failed" });
  }
};

function filterServiceAreaRides(rides) {
  return rides.filter(ridePickupInServiceArea);
}

async function findPendingRidesForCaptain(cap, captainId) {
  // Prevent "ghost popups": ignore old searching rides that were never completed/cancelled.
  // (These remain in DB from previous tests and make driver panel show popups even when user didn't create a ride now.)
  const maxAgeMin = Number(process.env.PENDING_RIDE_MAX_AGE_MIN || 45);
  const createdAfter = new Date(Date.now() - maxAgeMin * 60 * 1000);
  /**
   * Recency is measured from when SEARCH began, not when the row was created, so a
   * ride scheduled hours earlier is still offerable once the dispatcher starts it.
   * Legacy rows without `searchStartedAt` fall back to `createdAt`.
   */
  const searchRecent = {
    $or: [
      { searchStartedAt: { $gte: createdAfter } },
      { searchStartedAt: null, createdAt: { $gte: createdAfter } },
    ],
  };
  const notClaimed = {
    $or: [{ captain: null }, { captain: { $exists: false } }],
  };
  const base = {
    status: "searching",
    city: cap.servingCity,
    vehicleType: cap.vehicleType,
    declinedBy: { $nin: [captainId] },
    $and: [searchRecent, notClaimed],
  };

  const baseLoose = {
    status: "searching",
    city: cap.servingCity,
    declinedBy: { $nin: [captainId] },
    $and: [searchRecent, notClaimed],
  };

  const coords = cap.location?.coordinates;
  const [lng, lat] = coords && coords.length >= 2 ? coords : [null, null];
  const hasRealGps =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(Math.abs(lat) < 0.02 && Math.abs(lng) < 0.02);

  const q = async (filter) =>
    rideModel
      .find(filter)
      .populate("user", "name phone email")
      .sort({ createdAt: -1 })
      .limit(20);

  if (!hasRealGps) {
    const list = await q(base);
    return filterServiceAreaRides(list);
  }

  const geoFilter = {
    $and: [
      base,
      { "pickup.coordinates.0": { $exists: true } },
      { "pickup.coordinates.1": { $exists: true } },
      {
        pickup: {
          $near: {
            $geometry: { type: "Point", coordinates: [lng, lat] },
            $maxDistance: RIDE_SEARCH_RADIUS_M,
          },
        },
      },
    ],
  };

  try {
    const nearby = await q(geoFilter);
    const filteredNearby = filterServiceAreaRides(nearby);
    if (filteredNearby.length > 0) return filteredNearby;
    // If no nearby rides matched, show same city+vehicle pending rides to avoid "only old driver gets popup".
    let fallback = await q(base);
    let fb = filterServiceAreaRides(fallback);
    if (fb.length > 0) return fb;

    const geoFilterLoose = {
      $and: [
        baseLoose,
        { "pickup.coordinates.0": { $exists: true } },
        { "pickup.coordinates.1": { $exists: true } },
        {
          pickup: {
            $near: {
              $geometry: { type: "Point", coordinates: [lng, lat] },
              $maxDistance: RIDE_SEARCH_RADIUS_M,
            },
          },
        },
      ],
    };
    const nearbyLoose = await q(geoFilterLoose);
    const nl = filterServiceAreaRides(nearbyLoose);
    if (nl.length > 0) return nl;

    const looseList = await q(baseLoose);
    return filterServiceAreaRides(looseList);
  } catch (e) {
    console.error("getPendingRides geo query fallback:", e?.message || e);
    let fallback = await q(base);
    let filtered = filterServiceAreaRides(fallback);
    if (filtered.length > 0) return filtered;
    const loose = await q(baseLoose);
    return filterServiceAreaRides(loose);
  }
}

module.exports.getPendingRides = async (req, res) => {
  try {
    await rideService.releaseCaptainBusyIfAvailable(req.captain._id);
    const cap = await captainModel
      .findById(req.captain._id)
      .select(
        "location servingCity vehicleType subscriptionStatus status blocked approved isOnline walletBalance busy",
      );
    console.log("======================================");
    console.log("DEBUG /rides/pending");
    console.log("Captain ID:", req.captain._id);
    console.log("Captain email:", req.captain.email);
    console.log("Captain busy:", cap?.busy);
    console.log("Captain object:", cap);
    console.log("======================================");
    /* Do not require cap.status==='active': disconnect sets inactive before reconnect; join/driver:join races with /rides/pending. */
    if (
      !cap ||
      cap.blocked ||
      !cap.approved ||
      cap.subscriptionStatus !== "active"
    ) {
      res.set({ "Cache-Control": "no-store" });
      return res.status(200).json([]);
    }
    if (cap.status !== "active" || cap.isOnline === false) {
      res.set({ "Cache-Control": "no-store" });
      return res.status(200).json([]);
    }
    const { minimumWalletBalance } = await getCaptainPricing();
    if (Number(cap.walletBalance || 0) < Number(minimumWalletBalance || 0)) {
      res.set({ "Cache-Control": "no-store" });
      return res.status(200).json([]);
    }
    if (!cap.servingCity || !cap.vehicleType) {
      res.set({ "Cache-Control": "no-store" });
      return res.status(200).json([]);
    }
    if (cap.busy) {
      res.set({ "Cache-Control": "no-store" });
      return res.status(200).json([]);
    }
    const rides = await findPendingRidesForCaptain(cap, req.captain._id);

    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    res.status(200).json(rides.map((r) => publicRide(r)));
  } catch (err) {
    console.error("getPendingRides:", err);
    res.status(500).json({ message: err.message || "pending rides failed" });
  }
};

module.exports.endRide = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { rideId } = req.body;

  try {
    const ride = await rideService.endRide({ rideId, captain: req.captain });
    const updated = await rideModel
      .findById(ride._id)
      .populate("user")
      .populate("captain");
    const pr = publicRide(updated);
    const confirmation = buildPassengerConfirmation(updated, undefined, {});
    confirmation.rideStatus = "completed";
    const uid = userIdOf(ride.user);
    const cid = captainIdOf(updated.captain);
    console.log(
      "[ride dispatch] rideCompleted ride=%s user=%s captain=%s",
      String(ride._id),
      uid || "none",
      cid || "none",
    );
    const completedPayload = {
      rideId: ride._id,
      status: "completed",
      ride: pr,
      confirmation,
    };
    if (uid) {
      emitToUser(uid, RIDE_COMPLETED, completedPayload);
      emitToUser(uid, "ride:status-update", {
        rideId: ride._id,
        status: "completed",
        ride: pr,
        confirmation,
      });
    }
    if (cid) {
      emitToCaptain(cid, RIDE_COMPLETED, {
        rideId: ride._id,
        status: "completed",
        ride: pr,
      });
    }
    emitStandardRidePhase("completed", {
      userId: uid,
      captainId: cid,
      payload: completedPayload,
    });
    // Persist the invoice snapshot as part of the ride lifecycle, so a completed ride
    // always has a record in `invoices` even if nobody opens the invoice screen.
    // Idempotent (returns the existing row) and never blocks ride completion.
    try {
      await invoiceService.getOrCreateInvoice(updated);
    } catch (err) {
      console.error("[endRide] invoice snapshot failed:", err?.message || err);
    }
    return res.status(200).json({
      ...pr,
      confirmation,
      ok: true,
      message: "Ride completed",
      requestId: req.requestId,
    });
  } catch (err) {
    const msg = err?.message || "Failed to end ride";
    return res.status(400).json({ message: msg });
  }
};

function historyUserObjectId(raw) {
  if (raw == null) return null;
  try {
    if (raw instanceof mongoose.Types.ObjectId) return raw;
    const nested = typeof raw === "object" && raw._id != null ? raw._id : raw;
    const s = String(nested);
    return mongoose.isValidObjectId(s) ? new mongoose.Types.ObjectId(s) : null;
  } catch {
    return null;
  }
}

module.exports.userRideHistory = async (req, res) => {
  const userIdRaw = req.user?._id ?? req.userId;
  const userObjectId = historyUserObjectId(userIdRaw);
  if (!userObjectId) {
    console.error("[userRideHistory] missing or invalid user id", {
      userIdRaw,
    });
    return fail(res, req, 401, "Unauthorized");
  }
  try {
    /**
     * `limit=all` returns the rider's complete list so the history page shows every
     * ride it counts. A numeric limit is still clamped to 100.
     */
    const wantsAll = String(req.query?.limit ?? "").toLowerCase() === "all";
    const limitRaw = Number(req.query?.limit);
    const limit = wantsAll
      ? 0
      : Number.isFinite(limitRaw)
        ? Math.min(100, Math.max(1, Math.floor(limitRaw)))
        : 50;
    /**
     * Auto-expired rides (`cancelledBy: 'system'`) never happened and the passenger
     * never chose to cancel them, so they are hidden from Ride History. A manual
     * passenger cancel (`cancelledBy: 'user'`) and a driver cancel (`'captain'`)
     * stay visible. Stored in DB either way — only the listing excludes them.
     */
    const notAutoExpired = { cancelledBy: { $ne: "system" } };
    /** OTP fields are select:false — do not use negative select; avoids some Mongoose edge cases. */
    const rides = await rideModel
      .find({ user: userObjectId, ...notAutoExpired })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    /**
     * Real totals over ALL of the rider's rides (not just the returned page), so the
     * history summary and the account stats never disagree with the true counts.
     * "Upcoming" mirrors the app's active statuses (scheduled/active trips).
     */
    const upcomingStatuses = ["scheduled", "searching", "accepted", "arrived", "started"];
    const [total, completed, cancelled, upcoming] = await Promise.all([
      rideModel.countDocuments({ user: userObjectId, ...notAutoExpired }),
      rideModel.countDocuments({ user: userObjectId, status: "completed" }),
      rideModel.countDocuments({ user: userObjectId, status: "cancelled", ...notAutoExpired }),
      rideModel.countDocuments({ user: userObjectId, status: { $in: upcomingStatuses } }),
    ]);

    const capIdStrings = [
      ...new Set(
        rides
          .map((r) => r.captain)
          .filter(Boolean)
          .map((id) => String(id)),
      ),
    ].filter((id) => mongoose.isValidObjectId(id));

    let capById = {};
    if (capIdStrings.length) {
      const capObjectIds = capIdStrings.map(
        (id) => new mongoose.Types.ObjectId(id),
      );
      const caps = await captainModel
        .find({ _id: { $in: capObjectIds } })
        .select("name phone vehicleType ratingSum ratingCount")
        .lean();
      capById = Object.fromEntries(caps.map((c) => [String(c._id), c]));
    }

    const list = rides.map((r) => {
      const o = publicRide(r);
      const cid = r.captain != null ? String(r.captain) : "";
      const c = cid && capById[cid] ? { ...capById[cid] } : null;
      if (c && c.ratingCount && c.ratingSum != null) {
        c.averageRating = Math.round((c.ratingSum / c.ratingCount) * 10) / 10;
      } else if (c) {
        c.averageRating = 0;
      }
      return { ...o, captain: c || (cid ? { _id: cid } : null) };
    });

    return ok(res, req, 200, "Ride history", {
      rides: list,
      counts: { total, completed, cancelled, upcoming },
    });
  } catch (err) {
    console.error("[userRideHistory] error", {
      message: err?.message,
      stack: err?.stack,
      userId: String(userObjectId),
    });
    return fail(res, req, 500, err.message || "Could not load history");
  }
};

module.exports.rateRide = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { rideId, rating, comment } = req.body;
  try {
    const ride = await rideService.rateRide({
      rideId,
      user: req.user._id,
      rating,
      comment: comment || "",
    });
    return res.status(200).json(publicRide(ride));
  } catch (err) {
    return res.status(err.statusCode || 400).json({ message: err.message });
  }
};

/** Captain confirms cash receipt for a completed ride (settles earnings once). */
module.exports.confirmPassengerPaidCaptain = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { rideId } = req.body;
  try {
    const ride = await rideModel.findOne({
      _id: rideId,
      captain: req.captain._id,
      status: "completed",
    });
    if (!ride) {
      return res.status(404).json({ message: "Completed ride not found" });
    }
    if (ride.paymentStatus === "success") {
      const updated = await rideModel
        .findById(rideId)
        .populate("user", "name phone email")
        .populate("captain");
      return res.status(200).json({
        ...publicRide(updated),
        ok: true,
        message: "Payment already recorded",
        requestId: req.requestId,
      });
    }

    const fresh =
      (await paymentService.settleRidePaymentIfNeeded(ride._id)) ||
      (await rideModel
        .findById(ride._id)
        .populate("user", "name phone email")
        .populate("captain"));
    const uid = userIdOf(fresh.user);
    const cid = captainIdOf(fresh.captain);
    if (uid) {
      emitToUser(uid, "ride:status-update", {
        rideId: fresh._id,
        status: "completed",
        paymentStatus: "success",
        ride: publicRide(fresh),
      });
    }
    if (cid) {
      emitToCaptain(cid, "ride:status-update", {
        rideId: fresh._id,
        status: "completed",
        paymentStatus: "success",
      });
    }
    return res.status(200).json({
      ...publicRide(fresh),
      ok: true,
      message: "Payment recorded",
      requestId: req.requestId,
    });
  } catch (err) {
    return res
      .status(400)
      .json({ message: err?.message || "Failed to record payment" });
  }
};

/** Captain rates passenger after ride (one per ride). */
module.exports.ratePassengerByCaptain = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { rideId, rating, tags } = req.body;
  const r = Number(rating);
  try {
    const ride = await rideModel.findOne({
      _id: rideId,
      captain: req.captain._id,
      status: "completed",
    });
    if (!ride) {
      return res.status(404).json({ message: "Completed ride not found" });
    }
    if (ride.captainPassengerRating != null) {
      return res
        .status(409)
        .json({ message: "Passenger already rated for this ride" });
    }
    if (!Number.isFinite(r) || r < 1 || r > 5) {
      return res.status(400).json({ message: "Rating must be 1–5" });
    }
    const tagList = Array.isArray(tags)
      ? tags
          .filter((t) => typeof t === "string")
          .map((t) => t.trim().slice(0, 48))
          .filter(Boolean)
          .slice(0, 6)
      : [];
    ride.captainPassengerRating = r;
    ride.captainPassengerTags = tagList;
    await ride.save();
    await ratingService.recordRating({
      rideId: ride._id,
      fromUserId: ride.captain,
      toUserId: ride.user,
      fromRole: 'CAPTAIN',
      rating: r,
      tags: tagList,
    });
    return res.status(200).json({
      ...publicRide(ride),
      ok: true,
      message: "Thanks for your feedback",
      requestId: req.requestId,
    });
  } catch (err) {
    return res
      .status(400)
      .json({ message: err?.message || "Failed to save rating" });
  }
};

/**
 * Build the passenger invoice from the real ride + payment ledger.
 * No fabricated values — every field maps to persisted ride/payment data.
 */
async function buildRideInvoice(ride) {
  const r = ride;
  const captain = r.captain;
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const advance = Math.round(num(r.price) * 0.25);
  const totalPaid = num(r.chargedAmount) > 0 ? num(r.chargedAmount) : num(r.price);
  const paymentStatus = r.paymentStatus === "success" ? "success" : "pending";
  let serverRef = null;
  try {
    const ledger = await PaymentRecord.findOne({ rideId: r._id }).lean();
    if (ledger) serverRef = { externalRef: ledger.externalRef, id: String(ledger._id) };
  } catch {
    // ledger lookup is best-effort for the invoice header
  }

  return {
    invoiceNumber: `RE-${String(r._id).slice(-8).toUpperCase()}`,
    invoiceDate: r.createdAt || new Date(),
    rideId: String(r._id),
    passenger: r.user ? { name: r.user.name || "", phone: r.user.phone || "" } : {},
    driver: captain
      ? {
          name: captain.name || "",
          rating: captain.averageRating != null ? Number(captain.averageRating) : 0,
        }
      : {},
    vehicle: {
      type: captain?.vehicleType || r.vehicleType || "",
      number: captain?.vehicleNumber || "",
    },
    pickup: r.pickupLocation || "",
    drop: r.dropLocation || "",
    distanceKm: num(r.distance),
    durationSec: num(r.duration),
    fare: num(r.price),
    discountAmount: num(r.discountAmount),
    discountReason: r.discountReason || "",
    serviceFee: r.platformFee != null ? num(r.platformFee) : null,
    chargedAmount: num(r.chargedAmount),
    totalPaid,
    advanceAmount: advance,
    remainingAmount: Math.max(0, totalPaid - advance),
    advancePaymentStatus: r.paymentStatus === "success" ? "success" : "pending",
    paymentMethod: r.paymentMethod || "Cash",
    paymentStatus,
    rating: r.rating != null ? Number(r.rating) : null,
    serverRef,
  };
}

/** Passenger invoice — COMPLETED rides only. */
module.exports.getRideInvoice = async (req, res) => {
  const rideId = req.params.id;
  if (!rideId || !mongoose.isValidObjectId(rideId)) {
    return fail(res, req, 400, "Invalid ride id");
  }
  try {
    const ride = await rideModel
      .findById(rideId)
      .populate("user", "name phone email")
      .populate("captain");
    if (!ride) return fail(res, req, 404, "Ride not found");

    const ownerId = userIdOf(ride.user);
    const requestUserId = req.user ? userIdOf(req.user) : null;
    if (!ownerId || !requestUserId || ownerId !== requestUserId) {
      return fail(res, req, 403, "Forbidden");
    }

    /**
     * A RideEasy invoice represents a successfully COMPLETED ride, nothing else.
     * Rejecting here also prevents an invoice snapshot being persisted for a ride
     * that was scheduled / searching / active / cancelled. (A cancellation fee is
     * deliberately not a ride invoice; that would be a separate feature.)
     */
    if (String(ride.status || "").toLowerCase() !== "completed") {
      return fail(res, req, 409, "Invoice is available only for completed rides");
    }

    // Persist immutable invoice snapshot to database collection `invoices`
    const persistedInvoice = await invoiceService.getOrCreateInvoice(ride);
    const invoice = await buildRideInvoice(ride);
    if (persistedInvoice?.invoiceNumber) {
      invoice.invoiceNumber = persistedInvoice.invoiceNumber;
    }
    return ok(res, req, 200, "Invoice generated", { invoice, invoiceRecord: persistedInvoice });
  } catch (err) {
    console.error("[getRideInvoice]", err?.message || err);
    return fail(res, req, 500, err.message || "Failed to generate invoice");
  }
};

/**
 * Record a ride payment from the passenger and persist it to the ledger + ride.
 * `part`: "advance" | "remaining" (exact advance split is derived from the ride price).
 * This endpoint is explicitly restricted to development mode.
 */
module.exports.payMock = async (req, res) => {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PAYMENTS !== "true") {
    return res.status(403).json({ message: "Mock payments are disabled in production" });
  }
  const { rideId, method, part } = req.body || {};
  if (!rideId || !mongoose.isValidObjectId(rideId)) {
    return res.status(400).json({ message: "Invalid ride id" });
  }
  try {
    const ride = await rideModel.findById(rideId);
    if (!ride) return res.status(404).json({ message: "Ride not found" });

    const ownerId = userIdOf(ride.user);
    const requestUserId = req.user ? userIdOf(req.user) : null;
    if (!ownerId || !requestUserId || ownerId !== requestUserId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { payable, advanceAmount, remainingAmount } = paymentService.computeAdvanceSplit(ride);
    const isRemaining = String(part).toLowerCase() === "remaining";
    const amount = isRemaining ? remainingAmount : advanceAmount;
    const paymentPart = isRemaining ? "remaining" : "advance";

    /**
     * A ride whose rail owes a provider-verified advance must never be marked paid
     * by this unverified recorder — only the Razorpay confirmation path can do that.
     * Cash and Wallet rides carry no such requirement.
     */
    if (!isRemaining && ride.advancePaymentRequired) {
      return res.status(409).json({
        message: "This ride's 25% advance can only be confirmed by the payment provider.",
      });
    }

    if (amount <= 0) {
      return res.status(400).json({ message: "Invalid payment amount" });
    }

    const externalRef = `txn_${Date.now()}`;
    let ledger = null;
    try {
      ledger = await PaymentRecord.create({
        rideId: ride._id,
        userId: ride.user,
        driverId: ride.captain || null,
        amount,
        paymentMode: normalizePaymentModeForLedger(method || ride.paymentMethod),
        paymentStatus: "success",
        paymentType: "ride_fare",
        paymentPart,
        externalRef,
      });
    } catch (e) {
      if (e?.code === 11000) {
        // duplicate partial-payment ledger — treat as already paid (idempotent)
        ledger = await PaymentRecord.findOne({ rideId: ride._id, paymentPart }).lean();
      } else {
        throw e;
      }
    }

    /**
     * An advance settles ONLY the 25% — the ride keeps `paymentStatus: pending` and
     * the remaining fare stays outstanding so the completion screen still collects
     * it. Only the remaining payment marks the whole ride as settled.
     */
    const set = isRemaining
      ? { paymentStatus: "success", chargedAmount: payable, remainingAmount: 0 }
      : {
          advancePercentage: paymentService.ADVANCE_PERCENTAGE,
          advanceAmount: amount,
          advancePaymentStatus: "success",
          advancePaymentState: "paid",
          advancePaymentTransactionId: ledger?.externalRef || externalRef,
          remainingAmount: paymentService.roundAmount(Math.max(0, payable - amount)),
        };

    const updated = await rideModel.findByIdAndUpdate(
      ride._id,
      { $set: set },
      { new: true, runValidators: false },
    ).populate("user", "name phone email").populate("captain");

    const payload = { rideId: ride._id, status: "completed", ride: publicRide(updated), paymentStatus: "success" };
    const uid = userIdOf(updated.user);
    const cid = captainIdOf(updated.captain);
    if (uid) {
      emitToUser(uid, "ride:status-update", payload);
      emitToUser(uid, RIDE_COMPLETED, payload);
    }
    if (cid) emitToCaptain(cid, "ride:status-update", payload);

    return res.status(200).json({
      ...publicRide(updated),
      ride: publicRide(updated),
      ok: true,
      message: "Payment recorded",
      amount,
      part: isRemaining ? "remaining" : "advance",
      requestId: req.requestId,
    });
  } catch (err) {
    console.error("[pay-mock]", err?.message || err);
    return res.status(500).json({ message: err?.message || "Payment failed" });
  }
};

module.exports.payWallet = async (req, res) => {
  const { rideId, part } = req.body || {};
  try {
    const result = await payRideFromWallet({
      rideId,
      userId: req.user?._id,
      part,
    });
    const updated = await rideModel.findById(rideId).populate("user", "name phone email").populate("captain");
    const payload = { rideId: updated._id, status: updated.status, ride: publicRide(updated), paymentStatus: updated.paymentStatus };
    const uid = userIdOf(updated.user);
    const cid = captainIdOf(updated.captain);
    if (uid) emitToUser(uid, "ride:status-update", payload);
    if (cid) emitToCaptain(cid, "ride:status-update", payload);
    return res.status(200).json({ ...publicRide(updated), ride: publicRide(updated), transaction: result.transaction, alreadyPaid: result.alreadyPaid, ok: true, message: "Wallet payment recorded" });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ message: err.message || "Wallet payment failed" });
  }
};

/** Verify a UPI payment intent for the ride and persist a real payment ledger row. */
module.exports.verifyUpiPayment = async (req, res) => {
  const { rideId, transactionRef, method } = req.body || {};
  if (!rideId || !mongoose.isValidObjectId(rideId)) {
    return res.status(400).json({ message: "Invalid ride id" });
  }
  try {
    const ride = await rideModel.findById(rideId);
    if (!ride) return res.status(404).json({ message: "Ride not found" });

    const ownerId = userIdOf(ride.user);
    const requestUserId = req.user ? userIdOf(req.user) : null;
    if (!ownerId || !requestUserId || ownerId !== requestUserId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const total = Number(ride.price) || 0;
    try {
      await PaymentRecord.create({
        rideId: ride._id,
        userId: ride.user,
        driverId: ride.captain || null,
        amount: total,
        paymentMode: normalizePaymentModeForLedger(method || ride.paymentMethod || "UPI"),
        paymentStatus: "success",
        paymentType: "ride_fare",
        externalRef: String(transactionRef || `upi_${Date.now()}`),
      });
    } catch (e) {
      if (e?.code !== 11000) throw e; // idempotent on duplicates
    }

    const updated = await rideModel
      .findByIdAndUpdate(
        ride._id,
        { $set: { paymentStatus: "success", chargedAmount: total } },
        { new: true, runValidators: false },
      )
      .populate("user", "name phone email")
      .populate("captain");

    const payload = { rideId: ride._id, status: "completed", ride: publicRide(updated), paymentStatus: "success" };
    const uid = userIdOf(updated.user);
    const cid = captainIdOf(updated.captain);
    if (uid) emitToUser(uid, "ride:status-update", payload);
    if (cid) emitToCaptain(cid, "ride:status-update", payload);

    return res.status(200).json({
      ...publicRide(updated),
      ride: publicRide(updated),
      ok: true,
      message: "Payment verified",
      paymentStatus: "success",
      requestId: req.requestId,
    });
  } catch (err) {
    console.error("[upi/verify]", err?.message || err);
    return res.status(500).json({ message: err?.message || "Payment verification failed" });
  }
};

/** Gateway credentials live on the server only — never in the React app. */
function razorpayGateway() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return {
      error:
        "Online payment gateway is not configured on the server (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)",
    };
  }
  return { keyId, keySecret, client: new Razorpay({ key_id: keyId, key_secret: keySecret }) };
}

/**
 * Ask the provider for a previously created order to decide whether it can still
 * be re-opened. Returns `{ paid: true }` when the provider already has a captured
 * payment for it (the ride then gets reconciled instead of charged again), or null
 * when the order is unusable so the caller creates a fresh one.
 */
async function fetchReusableRazorpayOrder(client, orderId, expectedAmountPaise) {
  try {
    const order = await client.orders.fetch(orderId);
    if (!order) return null;
    if (order.status === "paid") {
      const captured = await findCapturedPaymentForOrder(client, orderId);
      return captured
        ? { paid: true, orderId: order.id, transactionId: captured.id }
        : null;
    }
    if (order.status !== "created" && order.status !== "attempted") return null;
    if (Number(order.amount) !== Number(expectedAmountPaise)) return null;
    return { paid: false, orderId: order.id };
  } catch (e) {
    console.warn("[ride advance] Razorpay order lookup failed:", e?.message || e);
    return null;
  }
}

/** The provider's own record of a successful payment on an order. */
async function findCapturedPaymentForOrder(client, orderId) {
  try {
    const res = await client.orders.fetchPayments(orderId);
    const list = Array.isArray(res?.items) ? res.items : [];
    return (
      list.find((p) => p.status === "captured") ||
      list.find((p) => p.status === "authorized") ||
      null
    );
  } catch (e) {
    console.warn("[ride advance] Razorpay order payments lookup failed:", e?.message || e);
    return null;
  }
}

function paymentPartOf(raw) {
  const part = String(raw || "advance").trim().toLowerCase();
  return [ "advance", "remaining", "full" ].includes(part) ? part : null;
}

/**
 * Create (or reuse) a Razorpay order for the ride's advance / remaining / full fare.
 *
 * The amount is ALWAYS recomputed from the persisted ride fare on the server, and
 * no order id is ever fabricated: if the gateway is unconfigured or unreachable the
 * request fails instead of pretending a payment can proceed.
 */
module.exports.createRideRazorpayOrder = async (req, res) => {
  const rideId = req.params.id;
  const part = paymentPartOf(req.body?.part);
  if (!rideId || !mongoose.isValidObjectId(rideId)) {
    return fail(res, req, 400, "Invalid ride id");
  }
  if (!part) return fail(res, req, 400, "Invalid payment part");

  const gateway = razorpayGateway();
  if (gateway.error) return fail(res, req, 503, gateway.error);

  try {
    const ride = await rideModel.findById(rideId);
    if (!ride) return fail(res, req, 404, "Ride not found");

    const ownerId = userIdOf(ride.user);
    const requestUserId = req.user ? userIdOf(req.user) : null;
    if (!ownerId || !requestUserId || ownerId !== requestUserId) {
      return fail(res, req, 403, "Forbidden");
    }

    const { payable, advanceAmount, remainingAmount } = paymentService.computeAdvanceSplit(ride);
    const amount = part === "advance" ? advanceAmount : part === "remaining" ? remainingAmount : payable;
    if (amount <= 0) return fail(res, req, 400, "Invalid payable amount");
    /** Paise from the same rounded amount that gets stored — the gateway charge matches exactly. */
    const amountPaise = Math.round(amount * 100);

    if (part === "advance" && ride.advancePaymentStatus === "success") {
      return ok(res, req, 200, "Advance payment already verified", {
        alreadyPaid: true,
        ride: publicRide(ride),
        amount,
        part,
      });
    }

    /**
     * Reuse the order this ride already opened, so a repeated tap (or a retry after
     * the passenger cancelled) can never start a second charge. If the provider says
     * that order is already paid, settle the ride from the provider's own record.
     */
    if (part === "advance" && ride.advancePaymentOrderId) {
      const reusable = await fetchReusableRazorpayOrder(
        gateway.client,
        ride.advancePaymentOrderId,
        amountPaise,
      );
      if (reusable?.paid) {
        const settled = await paymentService.confirmRideAdvancePaid({
          rideId: ride._id,
          transactionId: reusable.transactionId,
          amount,
        });
        return ok(res, req, 200, "Advance payment already verified", {
          alreadyPaid: true,
          ride: publicRide(settled || ride),
          amount,
          part,
        });
      }
      if (reusable) {
        return ok(res, req, 200, "Existing payment order reused", {
          orderId: reusable.orderId,
          amount,
          currency: "INR",
          keyId: gateway.keyId,
          part,
          reused: true,
        });
      }
    }

    const order = await gateway.client.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `rcpt_${String(ride._id).slice(-10)}_${part}_${Date.now()}`,
      notes: {
        rideId: String(ride._id),
        userId: String(ownerId),
        paymentType: "ride_fare",
        part,
      },
    });
    if (!order?.id) {
      return fail(res, req, 502, "Could not start the payment. Please try again.");
    }

    if (part === "advance") {
      await rideModel.updateOne(
        { _id: ride._id },
        {
          $set: {
            advancePaymentRequired: true,
            advancePercentage: paymentService.ADVANCE_PERCENTAGE,
            advanceAmount: amount,
            remainingAmount: Math.max(0, paymentService.roundAmount(payable - amount)),
            advancePaymentOrderId: order.id,
            advancePaymentState: "processing",
          },
        },
      );
    }

    return ok(res, req, 200, "Razorpay order created", {
      orderId: order.id,
      amount,
      currency: "INR",
      keyId: gateway.keyId,
      part,
      reused: false,
    });
  } catch (err) {
    console.error("[createRideRazorpayOrder]", err?.message || err);
    /* A provider failure must never look like a usable payment order. */
    return fail(res, req, 502, "Could not start the payment. Please try again.");
  }
};

/**
 * Confirm a Razorpay payment for the ride.
 *
 * Opening a UPI app is not proof of payment, so the callback is verified twice:
 * the checkout signature proves the response came from Razorpay untampered, and the
 * payment is then fetched from the Razorpay API to check its status, amount,
 * currency and order. Only then is the ride's advance marked paid — and only the
 * advance, so the remaining fare stays outstanding.
 */
module.exports.verifyRideRazorpayPayment = async (req, res) => {
  const rideId = req.params.id;
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
  const part = paymentPartOf(req.body?.part);
  if (!rideId || !mongoose.isValidObjectId(rideId)) {
    return fail(res, req, 400, "Invalid ride id");
  }
  if (!part) return fail(res, req, 400, "Invalid payment part");
  if (!razorpayPaymentId) return fail(res, req, 400, "razorpayPaymentId is required");
  if (!razorpayOrderId || !razorpaySignature) {
    return fail(res, req, 400, "razorpayOrderId and razorpaySignature are required");
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return fail(res, req, 503, "Online payment gateway is not configured on the server (RAZORPAY_KEY_SECRET)");
  }

  try {
    const ride = await rideModel.findById(rideId);
    if (!ride) return fail(res, req, 404, "Ride not found");

    const ownerId = userIdOf(ride.user);
    const requestUserId = req.user ? userIdOf(req.user) : null;
    if (!ownerId || !requestUserId || ownerId !== requestUserId) {
      return fail(res, req, 403, "Forbidden");
    }

    /** Idempotent — a repeated callback for an already-verified advance changes nothing. */
    if (part === "advance" && ride.advancePaymentStatus === "success") {
      return ok(res, req, 200, "Advance payment already verified", {
        alreadyPaid: true,
        ride: publicRide(ride),
        paymentStatus: ride.paymentStatus,
      });
    }

    const paymentId = String(razorpayPaymentId);
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpayOrderId}|${paymentId}`)
      .digest("hex");
    const providedSignature = String(razorpaySignature);
    const signatureMatches =
      expectedSignature.length === providedSignature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature));
    if (!signatureMatches) {
      return fail(res, req, 400, "Invalid payment signature");
    }

    const { payable, advanceAmount, remainingAmount } = paymentService.computeAdvanceSplit(ride);
    const expectedAmount =
      part === "advance" ? advanceAmount : part === "remaining" ? remainingAmount : payable;

    /* The signature does not cover the amount, so read the payment back from Razorpay. */
    const client = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: keySecret });
    let payment;
    try {
      payment = await client.payments.fetch(paymentId);
    } catch (e) {
      console.error("[verifyRideRazorpayPayment] provider lookup failed:", e?.message || e);
      return fail(res, req, 502, "Could not confirm the payment with the gateway. Please try again.");
    }

    if (Number(payment?.amount) !== Math.round(expectedAmount * 100)) {
      return fail(res, req, 400, "Paid amount does not match this ride's payable amount");
    }
    if (String(payment?.currency || "INR").toUpperCase() !== "INR") {
      return fail(res, req, 400, "Unsupported payment currency");
    }
    if (![ "captured", "authorized" ].includes(String(payment?.status))) {
      /** A provider-confirmed failure is recorded; `created`/`attempted` just means unfinished. */
      if (part === "advance" && String(payment?.status) === "failed") {
        await rideModel.updateOne(
          { _id: ride._id, advancePaymentStatus: { $ne: "success" } },
          { $set: { advancePaymentStatus: "failed", advancePaymentState: "failed" } },
        );
      }
      return fail(res, req, 409, `Payment is not successful yet (status: ${payment?.status || "unknown"})`);
    }
    if (payment?.order_id && String(payment.order_id) !== String(razorpayOrderId)) {
      return fail(res, req, 400, "Payment does not belong to the supplied order");
    }
    if (
      part === "advance" &&
      ride.advancePaymentOrderId &&
      String(payment?.order_id) !== String(ride.advancePaymentOrderId)
    ) {
      return fail(res, req, 400, "Payment does not belong to this ride's advance order");
    }

    if (part === "advance") {
      const settled = await paymentService.confirmRideAdvancePaid({
        rideId: ride._id,
        transactionId: paymentId,
        amount: expectedAmount,
      });
      if (!settled) return fail(res, req, 404, "Ride not found");

      const payload = {
        rideId: settled._id,
        status: settled.status,
        ride: publicRide(settled),
        paymentStatus: settled.paymentStatus,
        advancePaymentStatus: settled.advancePaymentStatus,
      };
      const uid = userIdOf(settled.user);
      const cid = captainIdOf(settled.captain);
      if (uid) emitToUser(uid, "ride:status-update", payload);
      if (cid) emitToCaptain(cid, "ride:status-update", payload);

      return ok(res, req, 200, "25% advance payment verified", {
        ...publicRide(settled),
        ride: publicRide(settled),
        paymentStatus: settled.paymentStatus,
        advancePaymentStatus: settled.advancePaymentStatus,
        alreadyPaid: false,
      });
    }

    /** Full / remaining fare settlement — unchanged behaviour once the gateway agrees. */
    await PaymentRecord.findOneAndUpdate(
      { rideId: ride._id, paymentType: "ride_fare", paymentPart: part },
      {
        $set: {
          userId: ride.user,
          driverId: ride.captain || null,
          amount: expectedAmount,
          discountAmount: Number(ride.discountAmount || 0),
          originalFare: Number(ride.originalFare ?? ride.price ?? 0),
          finalPayableAmount: payable,
          paymentMode: "Online",
          paymentStatus: "success",
          paymentType: "ride_fare",
          paymentPart: part,
          externalRef: paymentId,
        },
      },
      { upsert: true, new: true },
    );

    const updated = await rideModel
      .findByIdAndUpdate(
        ride._id,
        { $set: { paymentStatus: "success", chargedAmount: payable, remainingAmount: 0 } },
        { new: true },
      )
      .populate("user", "name phone email")
      .populate("captain");

    const payload = {
      rideId: ride._id,
      status: updated.status,
      ride: publicRide(updated),
      paymentStatus: updated.paymentStatus,
    };
    const uid = userIdOf(updated.user);
    const cid = captainIdOf(updated.captain);
    if (uid) emitToUser(uid, "ride:status-update", payload);
    if (cid) emitToCaptain(cid, "ride:status-update", payload);

    return ok(res, req, 200, "Payment verified successfully", {
      ...publicRide(updated),
      ride: publicRide(updated),
      paymentStatus: updated.paymentStatus,
    });
  } catch (err) {
    console.error("[verifyRideRazorpayPayment]", err?.message || err);
    return fail(res, req, 500, err.message || "Payment verification failed");
  }
};

/** Passenger requests refund for ride */
module.exports.requestRideRefund = async (req, res) => {
  const rideId = req.params.id;
  const { reason } = req.body || {};
  if (!rideId || !mongoose.isValidObjectId(rideId)) {
    return fail(res, req, 400, "Invalid ride id");
  }
  try {
    const refund = await refundService.requestRefund({
      rideId,
      userId: req.user._id,
      reason,
    });
    return ok(res, req, 201, "Refund request submitted", { refund });
  } catch (err) {
    return fail(res, req, err.statusCode || 500, err.message || "Failed to submit refund request");
  }
};

/** Create share token for live trip tracking */
module.exports.createRideShare = async (req, res) => {
  const rideId = req.params.id;
  if (!rideId || !mongoose.isValidObjectId(rideId)) {
    return fail(res, req, 400, "Invalid ride id");
  }
  try {
    const ride = await rideModel.findById(rideId);
    if (!ride) return fail(res, req, 404, "Ride not found");

    const ownerId = userIdOf(ride.user);
    const requestUserId = req.user ? userIdOf(req.user) : null;
    if (!ownerId || !requestUserId || ownerId !== requestUserId) {
      return fail(res, req, 403, "Forbidden");
    }

    const shareToken = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const share = await RideShare.create({
      shareToken,
      rideId: ride._id,
      userId: ownerId,
      expiresAt,
    });

    return ok(res, req, 201, "Share token generated", {
      shareToken: share.shareToken,
      expiresAt: share.expiresAt,
    });
  } catch (err) {
    return fail(res, req, 500, err.message || "Failed to generate share token");
  }
};

/** Public view of shared trip (redacted for safety) */
module.exports.getRideShare = async (req, res) => {
  const { token } = req.params;
  if (!token) return fail(res, req, 400, "Share token required");
  try {
    const share = await RideShare.findOne({ shareToken: token, revoked: false });
    if (!share || share.expiresAt < new Date()) {
      return fail(res, req, 404, "Share link is expired or invalid");
    }

    const ride = await rideModel.findById(share.rideId).populate("captain", "name phone vehicleType vehicleNumber location");
    if (!ride) return fail(res, req, 404, "Ride not found");

    const sharedData = {
      status: ride.status,
      pickupLocation: ride.pickupLocation,
      dropLocation: ride.dropLocation,
      vehicleType: ride.vehicleType,
      captain: ride.captain ? {
        name: ride.captain.name,
        vehicleType: ride.captain.vehicleType,
        vehicleNumber: ride.captain.vehicleNumber,
        location: ride.captain.location,
      } : null,
      etaMinutes: ride.duration ? Math.round(ride.duration / 60) : null,
    };

    return ok(res, req, 200, "Shared trip details", { ride: sharedData });
  } catch (err) {
    return fail(res, req, 500, err.message || "Failed to load shared trip");
  }
};

/** Revoke ride share */
module.exports.revokeRideShare = async (req, res) => {
  const rideId = req.params.id;
  if (!rideId || !mongoose.isValidObjectId(rideId)) {
  }
  try {
    await RideShare.updateMany({ rideId, userId: req.user._id }, { $set: { revoked: true } });
    return ok(res, req, 200, "Trip share revoked");
  } catch (err) {
    return fail(res, req, 500, err.message || "Failed to revoke share");
  }
};
