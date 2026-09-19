const { validationResult } = require("express-validator");
const mongoose = require("mongoose");
const captainModel = require("../models/captain.model");
const blackListTokenModel = require("../models/blackListToken.model");
const rideModel = require("../models/rideCore.model");
const { getAuthCookieOptions } = require("../utils/authCookie");
const { randomSixDigit, expiresInMinutes } = require("../utils/otp");
const {
  syncSubscriptionState,
  isSubscriptionValid,
} = require("../services/subscriptionDriver.service");
const { toPublicDoc } = require("../utils/publicDoc");
const { ok, fail } = require("../utils/apiResponse");
const { logLoginRequestBody } = require("../utils/loginDebug");
const driverService = require("../services/driver.service");

/** Minimal identity payload for authentication responses; full details remain on /captains/profile. */
function toCaptainLoginDoc(captain) {
  const publicCaptain = toPublicDoc(captain);
  const { _id, name, phone, email, createdAt, updatedAt, __v, id } =
    publicCaptain;
  return { _id, name, phone, email, createdAt, updatedAt, __v, id };
}

function toCaptainBasicProfileDoc(captain) {
  return {
    _id: captain._id,
    name: captain.name,
    phone: captain.phone,
    email: captain.email,
    servingCity: captain.servingCity,
    status: captain.status || "inactive",
    isOnline: Boolean(captain.isOnline),
    busy: captain.busy,
    walletBalance: Number(captain.walletBalance || 0),
    totalEarnings: Number(captain.totalEarnings || 0),
  };
}

module.exports.registerCaptain = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return fail(res, req, 400, "Validation failed", { errors: errors.array() });

  const { name, phone, email, password } = req.body;
  const normalizedPhone = String(phone).replace(/\D/g, "");

  const existing = await captainModel.findOne({
    $or: [{ email: String(email).toLowerCase() }, { phone: normalizedPhone }],
  });
  if (existing) return fail(res, req, 400, "Driver already exist");

  const hashed = await captainModel.hashPassword(password);
  const captain = await captainModel.create({
    name: String(name).trim(),
    phone: normalizedPhone,
    email: String(email).toLowerCase().trim(),
    password: hashed,
  });
  const token = captain.generateAuthToken();
  res.cookie("token", token, getAuthCookieOptions());
  return ok(
    res,
    req,
    201,
    "Captain registered",
    { token, captain: toPublicDoc(captain) },
    { includeFlatData: false },
  );
};

module.exports.loginCaptain = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logLoginRequestBody("captains/login", req.body);
      return fail(res, req, 400, "Validation failed", {
        errors: errors.array(),
      });
    }
    logLoginRequestBody("captains/login", req.body);

    if (!process.env.JWT_SECRET) {
      console.error("[captains/login] JWT_SECRET is not set");
      return fail(res, req, 500, "Server configuration error");
    }

    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = req.body?.password;
    if (typeof password !== "string") {
      return fail(res, req, 400, "Password is required");
    }

    const captain = await captainModel.findOne({ email }).select("+password");
    if (!captain) {
      return fail(res, req, 401, "Invalid email or password");
    }

    const isPasswordValid = await captain.comparePassword(password);
    if (!isPasswordValid) {
      return fail(res, req, 401, "Invalid email or password");
    }

    const fresh = await syncSubscriptionState(captain);
    const token = fresh.generateAuthToken();
    res.cookie("token", token, getAuthCookieOptions());
    return ok(
      res,
      req,
      200,
      "Login successful",
      { token, captain: toCaptainLoginDoc(fresh) },
      { includeFlatData: false },
    );
  } catch (err) {
    console.error("[captains/login]", err);
    return fail(res, req, 500, "Login failed");
  }
};

module.exports.getCaptainProfile = async (req, res) => {
  return ok(
    res,
    req,
    200,
    "Profile fetched",
    { captain: toCaptainBasicProfileDoc(req.captain) },
    { includeFlatData: false },
  );
};

module.exports.addWalletBalance = async (req, res) => {
  const amount = Number(req.body?.amount);
  const maxRechargeAmount = 1_000_000;

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > maxRechargeAmount
  ) {
    return fail(
      res,
      req,
      400,
      `amount must be greater than 0 and no more than ${maxRechargeAmount}`,
    );
  }

  const captain = await captainModel.findOneAndUpdate(
    { _id: req.captain._id },
    { $inc: { walletBalance: amount } },
    { new: true },
  );

  if (!captain) return fail(res, req, 404, "Driver not found");

  return ok(res, req, 200, "Wallet recharged", {
    walletBalance: Number(captain.walletBalance || 0),
  });
};

/** Update optional payment onboarding data without coupling it to signup. */
module.exports.updateCaptainPayee = async (req, res) => {
  const body = req.body || {};
  const patch = {};
  if (body.upiId !== undefined)
    patch.upiId = String(body.upiId || "")
      .trim()
      .toLowerCase()
      .slice(0, 100);
  if (body.paymentQrUrl !== undefined)
    patch.paymentQrUrl = String(body.paymentQrUrl || "")
      .trim()
      .slice(0, 2048);
  if (body.bankDetails !== undefined)
    return fail(res, req, 400, "Bank details are not supported for captains");
  if (!Object.keys(patch).length)
    return fail(res, req, 400, "Nothing to update");
  const captain = await captainModel.findByIdAndUpdate(req.captain._id, patch, {
    new: true,
  });
  if (!captain) return fail(res, req, 404, "Driver not found");
  return ok(res, req, 200, "Profile updated", {
    captain: toPublicDoc(captain),
  });
};

module.exports.logoutCaptain = async (req, res) => {
  const token =
    req.rawBearerToken ||
    req.cookies?.token ||
    req.headers.authorization?.split(" ")[1];
  if (token) {
    try {
      await blackListTokenModel.create({ token });
    } catch (err) {
      if (err?.code !== 11000) {
        console.warn("[captains/logout] blacklist:", err?.message);
      }
    }
  }
  res.clearCookie("token", getAuthCookieOptions());
  return ok(res, req, 200, "Logout successfully");
};

module.exports.updateStatus = async (req, res) => {
  const { status } = req.body || {};
  if (!["active", "inactive"].includes(status))
    return res
      .status(400)
      .json({ message: "Status must be active or inactive" });
  if (status === "inactive") {
    await captainModel.findByIdAndUpdate(req.captain._id, {
      status,
      isOnline: false,
    });
    return res.status(200).json({ status });
  }
  let cap = await captainModel.findById(req.captain._id);
  cap = await syncSubscriptionState(cap);
  if (!cap.approved) {
    return res
      .status(403)
      .json({ message: "Admin approval required before going online." });
  }
  if (cap.blocked) {
    return res.status(403).json({ message: "Account blocked." });
  }
  if (!isSubscriptionValid(cap)) {
    return res
      .status(403)
      .json({ message: "Active subscription required. Renew if expired." });
  }
  await captainModel.findByIdAndUpdate(req.captain._id, {
    status,
    isOnline: true,
  });
  return res.status(200).json({ status });
};

/** Prior trips with this passenger rated by this captain (for driver completion UI). */
module.exports.getPassengerRatingSummary = async (req, res) => {
  try {
    const userId = (req.query.userId || "").toString().trim();
    if (!mongoose.isValidObjectId(userId)) {
      return fail(res, req, 400, "Invalid user id");
    }
    const capId = req.captain._id;
    const uid = new mongoose.Types.ObjectId(userId);
    const rows = await rideModel.aggregate([
      {
        $match: {
          captain: capId,
          user: uid,
          captainPassengerRating: { $ne: null },
        },
      },
      {
        $group: {
          _id: null,
          avg: { $avg: "$captainPassengerRating" },
          n: { $sum: 1 },
        },
      },
    ]);
    const row = rows[0];
    const avgRating =
      row && Number.isFinite(row.avg) ? Math.round(row.avg * 10) / 10 : null;
    return ok(
      res,
      req,
      200,
      "Summary",
      {
        avgRating,
        ratedTrips: row?.n || 0,
      },
      { includeFlatData: false },
    );
  } catch (err) {
    return fail(res, req, 500, err.message || "Summary failed");
  }
};

module.exports.getEarnings = async (req, res) => {
  try {
    const data = await driverService.getEarningsSummary(req.captain._id);
    return ok(res, req, 200, "Earnings", data, { includeFlatData: false });
  } catch (err) {
    return fail(res, req, 500, err.message || "Earnings failed");
  }
};

module.exports.getRideHistory = async (req, res) => {
  try {
    const limitRaw = Number(req.query?.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(100, Math.max(1, Math.floor(limitRaw)))
      : 40;
    const rides = await rideModel
      .find({ captain: req.captain._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("user", "name phone")
      .select(
        "pickupLocation dropLocation price status createdAt completedAt vehicleType paymentMethod captainNetEarning user",
      )
      .lean();
    return ok(
      res,
      req,
      200,
      "Ride history",
      { rides },
      { includeFlatData: false },
    );
  } catch (err) {
    return fail(res, req, 500, err.message || "History failed");
  }
};

module.exports.sendDriverPhoneOtp = async (req, res) => {
  const phone = String(req.body?.phone || "").replace(/\D/g, "");
  if (phone.length < 10)
    return res.status(400).json({ message: "Valid phone required" });
  const captain = await captainModel
    .findOne({ phone })
    .select("+loginOtp +loginOtpExpiresAt");
  const otp = randomSixDigit();
  const exposeOtp =
    process.env.OTP_DEBUG === "true" || process.env.NODE_ENV !== "production";
  if (!captain)
    return res
      .status(404)
      .json({ message: "No driver with this phone — register first" });
  captain.loginOtp = otp;
  captain.loginOtpExpiresAt = expiresInMinutes(5);
  await captain.save();
  return res.json({
    message: exposeOtp ? "OTP generated (dev)" : "OTP sent",
    expiresIn: 300,
    ...(exposeOtp ? { debugOtp: otp } : {}),
  });
};

module.exports.verifyDriverPhoneOtp = async (req, res) => {
  const phone = String(req.body?.phone || "").replace(/\D/g, "");
  const otp = String(req.body?.otp || "");
  if (phone.length < 10 || otp.length !== 6)
    return res.status(400).json({ message: "Phone and OTP required" });
  const captain = await captainModel
    .findOne({ phone })
    .select("+loginOtp +loginOtpExpiresAt");
  if (!captain?.loginOtp)
    return res.status(400).json({ message: "Request OTP first" });
  if (captain.loginOtp !== otp)
    return res.status(400).json({ message: "Invalid OTP" });
  if (captain.loginOtpExpiresAt < new Date())
    return res.status(400).json({ message: "OTP expired" });
  captain.loginOtp = undefined;
  captain.loginOtpExpiresAt = undefined;
  await captain.save();
  const token = captain.generateAuthToken();
  return res.status(200).json({ token, captain: toPublicDoc(captain) });
};
