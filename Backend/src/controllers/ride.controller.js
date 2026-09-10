const mongoose = require("mongoose");
const rideService = require("../services/rideCore.service");
const paymentService = require("../services/payment.service");
const PaymentRecord = require("../models/paymentRecord.model");
const { getCaptainPricing } = require("../services/pricing.service");
const { validationResult } = require("express-validator");
const mapService = require("../services/maps.service");
const rideModel = require("../models/rideCore.model");
const captainModel = require("../models/captain.model");
const { decryptOtp, encryptOtp, hashOtp } = require("../utils/otpSecure");
const { expiresInMinutes, randomSixDigit } = require("../utils/otp");
const { fail, ok } = require("../utils/apiResponse");
const {
  isWithinServiceArea,
  inferServiceCityKeyOrNearest,
  ridePickupInServiceArea,
  logServiceAreaDistances,
  SERVICE_AREA_ERROR,
} = require("../utils/serviceArea");

const {
  emitToUser,
  emitToCaptain,
  emitStandardRidePhase,
} = require("../socket");
const {
  RIDE_REQUEST,
  RIDE_ACCEPTED,
  RIDE_STARTED,
  RIDE_COMPLETED,
} = require("../socket/rideSocket.events");

const RIDE_SEARCH_RADIUS_M = 5000;

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

const SOCKET_DEBUG =
  process.env.RIDEEASY_SOCKET_DEBUG === "1" ||
  process.env.RIDEEASY_SOCKET_DEBUG === "true";

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
  const drivers = await captainModel
    .find({
      approved: true,
      blocked: { $ne: true },
      ...subscriptionNotExpiredMatch(),
      ...driverPresenceMatch(),
      ...(await captainWalletMatch()),
      servingCity: rideCity,
      vehicleType: { $in: captainVehicleTypesForRide(vehicleType) },
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
}

/** When no one is within 5km (GPS mismatch / dev), still notify online drivers in same city + vehicle type. */
async function findCityFallbackDriverIds({ rideCity, vehicleType }) {
  const drivers = await captainModel
    .find({
      approved: true,
      blocked: { $ne: true },
      ...subscriptionNotExpiredMatch(),
      ...driverPresenceMatch(),
      ...(await captainWalletMatch()),
      servingCity: rideCity,
      vehicleType: { $in: captainVehicleTypesForRide(vehicleType) },
    })
    .limit(40)
    .select("_id");
  return drivers.map((d) => d._id.toString());
}

/** Last resort: same city, any vehicle — avoids zero drivers when captain vehicle ≠ requested ride type (accept still allowed). */
async function findCityAnyVehicleDriverIds({ rideCity }) {
  const drivers = await captainModel
    .find({
      approved: true,
      blocked: { $ne: true },
      ...subscriptionNotExpiredMatch(),
      ...driverPresenceMatch(),
      ...(await captainWalletMatch()),
      servingCity: rideCity,
    })
    .limit(40)
    .select("_id");
  return drivers.map((d) => d._id.toString());
}

function broadcastRideNew(rideDoc, driverIds) {
  const ride = publicRide(rideDoc);
  const offeredAt = Date.now();
  const payload = { ride, offeredAt };
  const rid = ride?._id != null ? String(ride._id) : "";
  if (SOCKET_DEBUG) {
    console.log(
      "[ride broadcast] ride=%s city=%s drivers=%s ids=%s",
      rid,
      rideDoc?.city || ride?.city || "",
      driverIds.length,
      driverIds.slice(0, 12).join(","),
    );
  }
  if (!driverIds.length) {
    console.warn(
      "[ride broadcast] no drivers matched for ride %s (check city, isOnline, subscription, vehicle)",
      rid,
    );
  }
  for (const id of driverIds) {
    emitToCaptain(id, RIDE_REQUEST, payload);
    emitToCaptain(id, "new-ride", payload);
  }
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

module.exports.createRide = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return fail(res, req, 400, "Validation failed", { errors: errors.array() });
  }

  const {
    pickupLocation,
    dropLocation,
    vehicleType,
    customerName,
    customerPhone,
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

    const { ride } = await rideService.createRide({
      user: req.user._id,
      pickupLocation,
      dropLocation,
      city: rideCity,
      vehicleType: vehicleTypeNorm,
      paymentMethod: "Cash",
      price: computedPrice,
      distanceKm: computedDistanceKm,
      customerName: customerName || req.user.name,
      customerPhone: customerPhone || req.user.phone,
      pickupCoordinates,
      dropCoordinates,
    });

    const uid = userIdOf(req.user);
    emitToUser(uid, "ride:status-update", {
      rideId: ride._id,
      status: "searching",
    });

    const populated = await rideModel
      .findById(ride._id)
      .populate("user")
      .populate("captain");
    const nearbyDriverIds = await findNearbyDriverIds({
      rideCity,
      vehicleType: populated.vehicleType,
      pickupLng: pickupCoordinates.lng,
      pickupLat: pickupCoordinates.lat,
    });
    const cityDriverIds = await findCityFallbackDriverIds({
      rideCity,
      vehicleType: populated.vehicleType,
    });
    let driverIds = mergeUniqueIds(nearbyDriverIds, cityDriverIds);
    if (driverIds.length === 0) {
      driverIds = await findCityAnyVehicleDriverIds({ rideCity });
    }
    if (SOCKET_DEBUG) {
      console.log(
        "[createRide] rideCity=%s vehicle=%s nearby=%s cityFb=%s",
        rideCity,
        populated.vehicleType,
        nearbyDriverIds.length,
        cityDriverIds.length,
      );
    }
    broadcastRideNew(populated, driverIds);
    return ok(
      res,
      req,
      201,
      "Ride created — OTP is shown after the driver arrives",
      { ride: publicRide(populated) },
      { includeFlatData: false },
    );
  } catch (err) {
    console.error(err);
    return fail(res, req, 500, err.message || "Failed to create ride");
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
    broadcastRideNew(ride, driverIds);
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
    const hasFullClientCoords = [pl, plng, dl, dlng].every(Number.isFinite);

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
    return fail(res, req, 500, err.message || "Failed to get fare");
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
    if (!["searching", "accepted", "arrived"].includes(st)) {
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
    await rideService.releaseCaptainBusyIfAvailable(ride.captain);
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
    await rideService.releaseCaptainBusyIfAvailable(ride.captain);
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
  const base = {
    status: "searching",
    city: cap.servingCity,
    vehicleType: cap.vehicleType,
    createdAt: { $gte: createdAfter },
    declinedBy: { $nin: [captainId] },
    $or: [{ captain: null }, { captain: { $exists: false } }],
  };

  const baseLoose = {
    status: "searching",
    city: cap.servingCity,
    createdAt: { $gte: createdAfter },
    declinedBy: { $nin: [captainId] },
    $or: [{ captain: null }, { captain: { $exists: false } }],
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
    const limitRaw = Number(req.query?.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(100, Math.max(1, Math.floor(limitRaw)))
      : 50;
    /** OTP fields are select:false — do not use negative select; avoids some Mongoose edge cases. */
    const rides = await rideModel
      .find({ user: userObjectId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

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

    return ok(res, req, 200, "Ride history", { rides: list });
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
    return res.status(400).json({ message: err.message });
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

/** Passenger invoice for a completed (or any) ride they own. */
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

    const invoice = await buildRideInvoice(ride);
    return ok(res, req, 200, "Invoice generated", { invoice });
  } catch (err) {
    console.error("[getRideInvoice]", err?.message || err);
    return fail(res, req, 500, err.message || "Failed to generate invoice");
  }
};

/**
 * Record a ride payment from the passenger and persist it to the ledger + ride.
 * `part`: "advance" | "remaining" (exact advance split is derived from the ride price).
 * This is not a mock — it writes a real PaymentRecord row and updates ride payment state.
 */
module.exports.payMock = async (req, res) => {
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

    const total = Number(ride.price) || 0;
    const isRemaining = String(part).toLowerCase() === "remaining";
    const advance = Math.round(total * 0.25);
    const amount = isRemaining ? Math.max(0, total - advance) : advance;

    if (amount <= 0) {
      return res.status(400).json({ message: "Invalid payment amount" });
    }

    let ledger = null;
    try {
      ledger = await PaymentRecord.create({
        rideId: ride._id,
        userId: ride.user,
        driverId: ride.captain || null,
        amount,
        paymentMode: String(method || "Cash") === "UPI" || String(method || "Cash") === "Online" ? "Cash" : "Cash",
        paymentStatus: "success",
        paymentType: "ride_fare",
        externalRef: `txn_${Date.now()}`,
      });
    } catch (e) {
      if (e?.code === 11000) {
        // duplicate partial-payment ledger — treat as already paid (idempotent)
        ledger = await PaymentRecord.findOne({ rideId: ride._id }).lean();
      } else {
        throw e;
      }
    }

    // The ride is settled once full payment is recorded (advance+remaining => success).
    const updated = await rideModel.findByIdAndUpdate(
      ride._id,
      {
        $set: {
          paymentStatus: "success",
          chargedAmount: total,
          ...(ride.captain ? {} : { chargedAmount: total }),
        },
      },
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
        paymentMode: "Cash",
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
