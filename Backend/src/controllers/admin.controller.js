const mongoose = require("mongoose");
const { validationResult } = require("express-validator");
const { ok, fail } = require("../utils/apiResponse");
const Admin = require("../models/admin.model");
const User = require("../models/user.model");
const Captain = require("../models/captain.model");
const CaptainOnboarding = require("../models/captainOnboarding.model");
const Ride = require("../models/rideCore.model");
const AuditLog = require("../models/auditLog.model");
const Refund = require("../models/refund.model");
const SosEvent = require("../models/sosEvent.model");
const SupportTicket = require("../models/supportTicket.model");
const Coupon = require("../models/coupon.model");
const { logAdminAction } = require("../services/auditLog.service");
const refundService = require("../services/refund.service");
const pricingService = require("../services/pricing.service");

/** Match ride.controller payRide / COMMISSION_PERCENT default (15%). */
function commissionPct() {
  return Number(process.env.COMMISSION_PERCENT || 15) / 100;
}

function adminLoginDebug(...args) {
  if (process.env.ADMIN_LOGIN_DEBUG === "true") console.log(...args);
}

module.exports.loginAdmin = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    adminLoginDebug("ADMIN LOGIN validation errors:", errors.array());
    return fail(res, req, 400, "Validation failed", { errors: errors.array() });
  }

  const { email, password } = req.body;

  const normalizedEmail = String(email ?? "")
    .toLowerCase()
    .trim();
  const normalizedPassword = String(password ?? "").trim();

  adminLoginDebug("ADMIN LOGIN attempt:", {
    normalizedEmail,
    hasPassword: !!normalizedPassword,
  });

  const admin = await Admin.findOne({ email: normalizedEmail }).select(
    "+password",
  );
  if (!admin) {
    adminLoginDebug("ADMIN LOGIN failed: admin not found for", normalizedEmail);
    return res.status(401).json({
      success: false,
      ok: false,
      message: "Admin not found for this email",
    });
  }

  const passwordOk = await admin.comparePassword(normalizedPassword);
  if (!passwordOk) {
    adminLoginDebug("ADMIN LOGIN failed: bad password for", normalizedEmail);
    return res
      .status(401)
      .json({ success: false, ok: false, message: "Password incorrect" });
  }

  const token = admin.generateAuthToken();
  adminLoginDebug("ADMIN LOGIN success (DB)", {
    id: admin._id,
    email: admin.email,
  });
  return res.status(200).json({
    success: true,
    ok: true,
    token,
    admin: { _id: admin._id, email: admin.email },
  });
};

module.exports.getAnalytics = async (req, res) => {
  try {
    const [
      totalUsers,
      totalDrivers,
      totalRides,
      completedRides,
      activeDriversOnline,
      completedRideCount,
      completedWithCaptainCount,
    ] = await Promise.all([
      User.countDocuments({}),
      Captain.countDocuments({}),
      Ride.countDocuments({}),
      Ride.find({ status: "completed" }).select("price city"),
      Captain.countDocuments({
        status: "active",
        subscriptionStatus: "active",
        approved: true,
        blocked: { $ne: true },
      }),
      Ride.countDocuments({ status: "completed" }),
      Ride.countDocuments({
        status: "completed",
        captain: { $exists: true, $ne: null },
      }),
    ]);

    const totalRevenue = completedRides.reduce(
      (sum, r) => sum + (r.price || 0),
      0,
    );

    const pct = commissionPct();
    const platformAgg = await Ride.aggregate([
      { $match: { status: "completed" } },
      {
        $addFields: {
          effPlatformFee: {
            $cond: [
              { $gt: [{ $ifNull: ["$platformFee", 0] }, 0] },
              "$platformFee",
              { $multiply: [{ $ifNull: ["$price", 0] }, pct] },
            ],
          },
        },
      },
      { $group: { _id: null, platformIncome: { $sum: "$effPlatformFee" } } },
    ]);
    const platformIncomeTotal = Math.round(platformAgg[0]?.platformIncome || 0);

    const cityAnalytics = {
      Kolhapur: { rides: 0, drivers: 0, revenue: 0 },
      Ichalkaranji: { rides: 0, drivers: 0, revenue: 0 },
      Sangli: { rides: 0, drivers: 0, revenue: 0 },
    };

    const [cityRideCounts, cityDriverCounts] = await Promise.all([
      Ride.aggregate([
        {
          $group: {
            _id: "$city",
            rides: { $sum: 1 },
            revenue: { $sum: "$price" },
          },
        },
      ]),
      Captain.aggregate([
        { $group: { _id: "$servingCity", drivers: { $sum: 1 } } },
      ]),
    ]);

    cityRideCounts.forEach((c) => {
      const key = c._id;
      if (!cityAnalytics[key])
        cityAnalytics[key] = { rides: 0, drivers: 0, revenue: 0 };
      cityAnalytics[key].rides = c.rides;
      cityAnalytics[key].revenue = c.revenue;
    });
    cityDriverCounts.forEach((c) => {
      const key = c._id;
      if (!cityAnalytics[key])
        cityAnalytics[key] = { rides: 0, drivers: 0, revenue: 0 };
      cityAnalytics[key].drivers = c.drivers;
    });

    return ok(res, req, 200, "Analytics", {
      totalUsers,
      totalDrivers,
      totalRides,
      totalRevenue,
      platformIncomeTotal,
      activeDriversOnline,
      completedRideCount,
      completedWithCaptainCount,
      cityAnalytics,
    });
  } catch (err) {
    return fail(res, req, 500, err.message || "Analytics failed");
  }
};

module.exports.getUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select("name email phone createdAt blocked")
      .sort({ createdAt: -1 })
      .limit(500);
    return ok(res, req, 200, "Users", { users });
  } catch (err) {
    return fail(res, req, 500, err.message || "Users failed");
  }
};

module.exports.getDrivers = async (req, res) => {
  try {
    const pct = commissionPct();
    /** Must match Mongoose actual collection names (Atlas: `rides`, `drivers`). */
    const ridesColl = Ride.collection.collectionName;

    /**
     * Join drivers â†’ rides by captain _id so ObjectId matching matches Atlas Browser.
     * Fallback: if no completed rides, show `totalEarnings` from driver document (ledger in MongoDB).
     */
    const enriched = await Captain.aggregate([
      { $sort: { createdAt: -1 } },
      { $limit: 500 },
      {
        $lookup: {
          from: ridesColl,
          let: { driverId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$status", "completed"] },
                    {
                      $or: [
                        { $eq: ["$captain", "$$driverId"] },
                        {
                          $eq: [
                            { $toString: "$captain" },
                            { $toString: "$$driverId" },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            },
            {
              $addFields: {
                effPlatformFee: {
                  $cond: [
                    { $gt: [{ $ifNull: ["$platformFee", 0] }, 0] },
                    "$platformFee",
                    { $multiply: [{ $ifNull: ["$price", 0] }, pct] },
                  ],
                },
              },
            },
            {
              $addFields: {
                effDriverIncome: {
                  $cond: [
                    { $ne: ["$captainNetEarning", null] },
                    "$captainNetEarning",
                    {
                      $subtract: [
                        { $ifNull: ["$price", 0] },
                        "$effPlatformFee",
                      ],
                    },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                completedRides: { $sum: 1 },
                driverIncome: { $sum: "$effDriverIncome" },
                platformFromDriver: { $sum: "$effPlatformFee" },
              },
            },
          ],
          as: "agg",
        },
      },
      {
        $addFields: {
          st: { $arrayElemAt: ["$agg", 0] },
        },
      },
      {
        $addFields: {
          completedRides: { $ifNull: ["$st.completedRides", 0] },
          _incomeFromRides: {
            $round: [{ $ifNull: ["$st.driverIncome", 0] }, 0],
          },
          platformShare: {
            $round: [{ $ifNull: ["$st.platformFromDriver", 0] }, 0],
          },
        },
      },
      {
        $addFields: {
          driverIncome: {
            $cond: [
              { $gt: ["$completedRides", 0] },
              "$_incomeFromRides",
              { $ifNull: ["$totalEarnings", 0] },
            ],
          },
        },
      },
      {
        $addFields: {
          effectiveSubscriptionStatus: {
            $cond: [
              {
                $and: [
                  { $eq: ["$subscriptionStatus", "active"] },
                  { $ne: ["$subscriptionExpiresAt", null] },
                  { $lte: ["$subscriptionExpiresAt", new Date()] },
                ],
              },
              "expired",
              "$subscriptionStatus",
            ],
          },
        },
      },
      {
        $project: {
          password: 0,
          loginOtp: 0,
          loginOtpExpiresAt: 0,
          agg: 0,
          st: 0,
          _incomeFromRides: 0,
        },
      },
    ]);

    return ok(res, req, 200, "Drivers", { drivers: enriched });
  } catch (err) {
    return fail(res, req, 500, err.message || "Drivers failed");
  }
};

module.exports.approveDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const onboarding = await CaptainOnboarding.findOne({
      captainId: id,
    }).select("personalInformation.servingCity vehicleInformation.vehicleType");

    const servingCity = onboarding?.personalInformation?.servingCity;
    const vehicleType = onboarding?.vehicleInformation?.vehicleType;
    const driver = await Captain.findByIdAndUpdate(
      id,
      {
        approved: true,
        ...(servingCity !== undefined ? { servingCity } : {}),
        ...(vehicleType !== undefined ? { vehicleType } : {}),
      },
      { new: true },
    ).select(
      "name email phone servingCity vehicleType vehicleNumber approved blocked subscriptionStatus",
    );
    if (!driver) return fail(res, req, 404, "Driver not found");
    void logAdminAction({
      adminId: req.admin?._id,
      action: "approve_driver",
      targetType: "driver",
      targetId: id,
      newValue: { approved: true, servingCity, vehicleType },
      req,
    });
    return ok(
      res,
      req,
      200,
      "Driver approved",
      { driver },
      { includeFlatData: false },
    );
  } catch (err) {
    return fail(res, req, 500, err.message || "Approve failed");
  }
};

module.exports.rejectDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const rejectionReason = String(reason || "Application rejected by admin").trim();

    const driver = await Captain.findByIdAndUpdate(
      id,
      { approved: false, rejectionReason },
      { new: true },
    ).select(
      "name email phone servingCity vehicleType vehicleNumber approved blocked subscriptionStatus",
    );
    if (!driver) return fail(res, req, 404, "Driver not found");

    await CaptainOnboarding.findOneAndUpdate(
      { captainId: id },
      { $set: { "documentVerification.status": "rejected", "documentVerification.rejectionReason": rejectionReason } }
    ).catch(() => {});

    void logAdminAction({
      adminId: req.admin?._id,
      action: "reject_driver",
      targetType: "driver",
      targetId: id,
      newValue: { approved: false, rejectionReason },
      req,
    });

    return ok(
      res,
      req,
      200,
      "Driver rejected",
      { driver, rejectionReason },
      { includeFlatData: false },
    );
  } catch (err) {
    return fail(res, req, 500, err.message || "Reject failed");
  }
};

const RIDE_STATUS_FILTER = [
  "searching",
  "accepted",
  "arrived",
  "started",
  "completed",
  "cancelled",
];

module.exports.getRides = async (req, res) => {
  try {
    const raw = req.query?.status;
    const status = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    const filter = {};
    if (status && status !== "all" && RIDE_STATUS_FILTER.includes(status)) {
      filter.status = status;
    }
    const rides = await Ride.find(filter)
      .select(
        "city pickupLocation dropLocation price status createdAt completedAt paymentMethod paymentStatus user captain",
      )
      .populate("user", "name phone")
      .populate("captain", "name phone vehicleNumber")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    return ok(res, req, 200, "Rides", { rides, filter: status || "all" });
  } catch (err) {
    return fail(res, req, 500, err.message || "Rides failed");
  }
};

module.exports.getPayments = async (req, res) => {
  try {
    const rides = await Ride.find({ status: "completed" })
      .select(
        "price paymentMethod paymentStatus chargedAmount platformFee captainNetEarning status createdAt completedAt pickupLocation dropLocation city",
      )
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    const payments = rides.map((r) => ({
      _id: r._id,
      type: "ride_fare",
      amount: r.chargedAmount != null ? r.chargedAmount : r.price,
      fare: r.price,
      paymentMode: r.paymentMethod,
      paymentStatus: r.paymentStatus || "pending",
      platformFee: r.platformFee,
      captainNetEarning: r.captainNetEarning,
      rideStatus: r.status,
      summary: `${(r.pickupLocation || "").slice(0, 40)} â†’ ${(r.dropLocation || "").slice(0, 40)}`,
      city: r.city,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    }));
    return ok(res, req, 200, "Payments", { payments });
  } catch (err) {
    return fail(res, req, 500, err.message || "Payments failed");
  }
};

module.exports.getSubscriptions = async (req, res) => {
  try {
    const SUB_PLANS = {
      BIKE: { weekly: 29, monthly: 99, yearly: 899 },
      AUTO: { weekly: 39, monthly: 149, yearly: 1199 },
      CAR: { weekly: 59, monthly: 199, yearly: 1599 },
    };
    const drivers = await Captain.find({ subscriptionStatus: { $ne: "none" } })
      .select("name email vehicleType subscriptionStatus createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean();
    const subs = drivers.map((d) => {
      const vtNorm = ["BIKE", "AUTO", "CAR"].includes(d.vehicleType)
        ? d.vehicleType
        : "AUTO";
      const vt = SUB_PLANS[vtNorm] ? vtNorm : "AUTO";
      const weekly = SUB_PLANS[vt]?.weekly ?? SUB_PLANS.AUTO.weekly;
      return {
        _id: d._id,
        driverName: d.name,
        email: d.email,
        vehicleType: d.vehicleType,
        plan: d.subscriptionStatus,
        weeklyChargeHint: weekly,
        status: d.subscriptionStatus,
        updatedAt: d.updatedAt,
      };
    });
    return ok(res, req, 200, "Subscriptions", { subscriptions: subs });
  } catch (err) {
    return fail(res, req, 500, err.message || "Subscriptions failed");
  }
};

module.exports.blockDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const { blocked } = req.body || {};
    if (typeof blocked !== "boolean")
      return fail(res, req, 400, "blocked boolean required");
    const driver = await Captain.findByIdAndUpdate(
      id,
      { blocked },
      { new: true },
    ).select("name email blocked approved");
    if (!driver) return fail(res, req, 404, "Driver not found");
    return ok(res, req, 200, blocked ? "Driver blocked" : "Driver unblocked", {
      driver,
    });
  } catch (err) {
    return fail(res, req, 500, err.message || "Block driver failed");
  }
};

module.exports.blockUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { blocked } = req.body || {};
    if (typeof blocked !== "boolean")
      return fail(res, req, 400, "blocked boolean required");
    const user = await User.findByIdAndUpdate(
      id,
      { blocked },
      { new: true },
    ).select("name email phone blocked");
    if (!user) return fail(res, req, 404, "User not found");
    return ok(res, req, 200, blocked ? "User blocked" : "User unblocked", {
      user,
    });
  } catch (err) {
    return fail(res, req, 500, err.message || "Block user failed");
  }
};

module.exports.getPricing = async (req, res) => {
  try {
    const [
      rates,
      driverPlans,
      captainPricing,
      serviceAreas,
      svcDoc,
    ] = await Promise.all([
      pricingService.getRates(),
      pricingService.getDriverPlansMerged(),
      pricingService.getCaptainPricing(),
      pricingService.getServiceAreas(),
      pricingService.ensureServiceDoc(),
    ]);

    return ok(res, req, 200, "Pricing", {
      rates,
      driverPlans,
      captainPricing,
      serviceAreas,
      commissionPercent: svcDoc?.commissionPercent,
      launchTrialDays: svcDoc?.launchTrialDays,
    });
  } catch (err) {
    return fail(res, req, 500, err.message || "Pricing failed");
  }
};

module.exports.updatePricing = async (req, res) => {
  try {
    const body = req.body || {};

    let rates = body.rates;
    const driverPlans = body.driverPlans;
    const captainPricing = body.captainPricing;

    if (!rates || typeof rates !== "object") {
      const {
        driverPlans: _dp,
        captainPricing: _cp,
        rates: _r,
        ...rest
      } = body;

      if (rest.AUTO || rest.CAR || rest.BIKE) {
        rates = rest;
      } else {
        rates = null;
      }
    }

    if (rates && typeof rates === "object") {
      await pricingService.updateRates(rates);
    }

    if (driverPlans && typeof driverPlans === "object") {
      await pricingService.updateDriverPlans(driverPlans);
    }

    if (captainPricing && typeof captainPricing === "object") {
      await pricingService.updateCaptainPricing(captainPricing);
    }

    const meta = {};

    if (body.commissionPercent != null) {
      meta.commissionPercent = Number(body.commissionPercent);
    }

    if (Array.isArray(body.serviceAreas)) {
      meta.serviceAreas = body.serviceAreas;
    }

    if (body.launchTrialDays != null) {
      meta.launchTrialDays = body.launchTrialDays;
    }

    if (Object.keys(meta).length) {
      await pricingService.updateServiceMeta(meta);
    }

    const [
      mergedRates,
      mergedPlans,
      captainPricingResult,
      serviceAreas,
      svcDoc,
    ] = await Promise.all([
      pricingService.getRates(),
      pricingService.getDriverPlansMerged(),
      pricingService.getCaptainPricing(),
      pricingService.getServiceAreas(),
      pricingService.ensureServiceDoc(),
    ]);

    return ok(res, req, 200, "Pricing updated", {
      rates: mergedRates,
      driverPlans: mergedPlans,
      captainPricing: captainPricingResult,
      serviceAreas,
      commissionPercent: svcDoc?.commissionPercent,
      launchTrialDays: svcDoc?.launchTrialDays,
    });
  } catch (err) {
    return fail(
      res,
      req,
      500,
      err.message || "Pricing update failed",
    );
  }
};

function validObjectId(id) {
  return mongoose.Types.ObjectId.isValid(String(id || ""));
}

/** Permanent removal â€” use only from trusted admin console. */
module.exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!validObjectId(id)) return fail(res, req, 400, "Invalid user id");
    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) return fail(res, req, 404, "User not found");
    void logAdminAction({
      adminId: req.admin?._id,
      action: "delete_user",
      targetType: "user",
      targetId: id,
      oldValue: { email: deleted.email, name: deleted.name },
      req,
    });
    return ok(res, req, 200, "User deleted", { deletedId: id });
  } catch (err) {
    return fail(res, req, 500, err.message || "Delete user failed");
  }
};

module.exports.deleteDriver = async (req, res) => {
  try {
    const { id } = req.params;
    if (!validObjectId(id)) return fail(res, req, 400, "Invalid driver id");
    const deleted = await Captain.findByIdAndDelete(id);
    if (!deleted) return fail(res, req, 404, "Driver not found");
    void logAdminAction({
      adminId: req.admin?._id,
      action: "delete_driver",
      targetType: "driver",
      targetId: id,
      oldValue: { email: deleted.email, name: deleted.name },
      req,
    });
    return ok(res, req, 200, "Driver deleted", { deletedId: id });
  } catch (err) {
    return fail(res, req, 500, err.message || "Delete driver failed");
  }
};

module.exports.deleteRide = async (req, res) => {
  try {
    const { id } = req.params;
    if (!validObjectId(id)) return fail(res, req, 400, "Invalid ride id");
    const deleted = await Ride.findByIdAndDelete(id);
    if (!deleted) return fail(res, req, 404, "Ride not found");
    void logAdminAction({
      adminId: req.admin?._id,
      action: "delete_ride",
      targetType: "ride",
      targetId: id,
      oldValue: { price: deleted.price, status: deleted.status },
      req,
    });
    return ok(res, req, 200, "Ride deleted", { deletedId: id });
  } catch (err) {
    return fail(res, req, 500, err.message || "Delete ride failed");
  }
};

/** Get Ride Details */
module.exports.getRideDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!validObjectId(id)) return fail(res, req, 400, "Invalid ride id");
    const ride = await Ride.findById(id).populate("user", "name email phone").populate("captain", "name email phone vehicleType vehicleNumber");
    if (!ride) return fail(res, req, 404, "Ride not found");
    return ok(res, req, 200, "Ride details", { ride });
  } catch (err) {
    return fail(res, req, 500, err.message || "Failed to fetch ride details");
  }
};

/** Audit Logs */
module.exports.getAuditLogs = async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 50));
    const page = Math.max(1, Number(req.query?.page) || 1);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find({}).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments({}),
    ]);
    return ok(res, req, 200, "Audit logs", { auditLogs: logs, total, page, limit });
  } catch (err) {
    return fail(res, req, 500, err.message || "Audit logs failed");
  }
};

/** Refunds */
module.exports.getRefunds = async (req, res) => {
  try {
    const refunds = await Refund.find({})
      .populate("userId", "name email phone")
      .populate("rideId", "pickupLocation dropLocation price status")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return ok(res, req, 200, "Refunds", { refunds });
  } catch (err) {
    return fail(res, req, 500, err.message || "Failed to load refunds");
  }
};

module.exports.processRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const refund = await refundService.processRefund({
      refundId: id,
      adminId: req.admin?._id,
      resolution: "COMPLETED",
    });
    void logAdminAction({
      adminId: req.admin?._id,
      action: "process_refund",
      targetType: "refund",
      targetId: id,
      newValue: { status: "COMPLETED", amount: refund.amount },
      req,
    });
    return ok(res, req, 200, "Refund processed successfully", { refund });
  } catch (err) {
    return fail(res, req, err.statusCode || 500, err.message || "Process refund failed");
  }
};

module.exports.rejectRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const refund = await refundService.processRefund({
      refundId: id,
      adminId: req.admin?._id,
      resolution: "FAILED",
      failureReason: reason || "Rejected by admin",
    });
    void logAdminAction({
      adminId: req.admin?._id,
      action: "reject_refund",
      targetType: "refund",
      targetId: id,
      newValue: { status: "FAILED", reason },
      req,
    });
    return ok(res, req, 200, "Refund rejected", { refund });
  } catch (err) {
    return fail(res, req, err.statusCode || 500, err.message || "Reject refund failed");
  }
};

/** SOS Events */
module.exports.getSosEvents = async (req, res) => {
  try {
    const events = await SosEvent.find({})
      .populate("userId", "name email phone emergencyContact")
      .populate("rideId", "pickupLocation dropLocation status")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return ok(res, req, 200, "SOS events", { sosEvents: events });
  } catch (err) {
    return fail(res, req, 500, err.message || "Failed to load SOS events");
  }
};

module.exports.resolveSos = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolutionNotes } = req.body || {};
    const event = await SosEvent.findByIdAndUpdate(
      id,
      {
        $set: {
          status: "resolved",
          resolvedBy: req.admin?._id,
          resolutionNotes: resolutionNotes || "Resolved by admin operations",
          resolvedAt: new Date(),
        },
      },
      { new: true }
    );
    if (!event) return fail(res, req, 404, "SOS event not found");
    void logAdminAction({
      adminId: req.admin?._id,
      action: "resolve_sos",
      targetType: "other",
      targetId: id,
      newValue: { status: "resolved", resolutionNotes },
      req,
    });
    return ok(res, req, 200, "SOS event resolved", { sosEvent: event });
  } catch (err) {
    return fail(res, req, 500, err.message || "Failed to resolve SOS");
  }
};

/** Support Tickets */
module.exports.getSupportTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find({})
      .populate("userId", "name email phone")
      .populate("rideId", "pickupLocation dropLocation price status")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return ok(res, req, 200, "Support tickets", { supportTickets: tickets });
  } catch (err) {
    return fail(res, req, 500, err.message || "Failed to fetch support tickets");
  }
};

module.exports.updateSupportTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, replyMessage, priority } = req.body || {};
    const ticket = await SupportTicket.findById(id);
    if (!ticket) return fail(res, req, 404, "Support ticket not found");

    if (status) ticket.status = status;
    if (priority) ticket.priority = priority;
    if (replyMessage) {
      ticket.responses.push({
        senderRole: "admin",
        senderId: req.admin?._id,
        message: replyMessage,
        createdAt: new Date(),
      });
    }
    ticket.assignedAdmin = req.admin?._id;
    await ticket.save();

    void logAdminAction({
      adminId: req.admin?._id,
      action: "update_support_ticket",
      targetType: "support_ticket",
      targetId: id,
      newValue: { status, priority, replied: !!replyMessage },
      req,
    });

    return ok(res, req, 200, "Support ticket updated", { supportTicket: ticket });
  } catch (err) {
    return fail(res, req, 500, err.message || "Failed to update support ticket");
  }
};

/** Coupons Management */
module.exports.getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find({}).sort({ createdAt: -1 }).lean();
    return ok(res, req, 200, "Coupons", { coupons });
  } catch (err) {
    return fail(res, req, 500, err.message || "Failed to fetch coupons");
  }
};

module.exports.createCoupon = async (req, res) => {
  try {
    const { code, discountType, discountValue, maxDiscount, usageLimit, description } = req.body || {};
    // Accept both the live field names and the older aliases.
    const minimumFare = req.body?.minFare ?? req.body?.minimumFare ?? 0;
    const validUntil = req.body?.validUntil ?? req.body?.expiresAt ?? null;
    const validFrom = req.body?.validFrom ?? null;
    const isActive = req.body?.isActive !== false && req.body?.active !== false;
    const normalizedType = String(discountType || 'percentage').toLowerCase();
    const type = [ 'percentage', 'flat', 'fixed' ].includes(normalizedType) ? normalizedType : 'percentage';
    if (!code || !discountValue) {
      return fail(res, req, 400, "Coupon code and discount value are required");
    }
    const expiresAt = validUntil ? new Date(validUntil) : null;
    const coupon = await Coupon.create({
      code: String(code).trim().toUpperCase(),
      discountType: type,
      discountValue: Number(discountValue),
      minFare: minimumFare != null ? Number(minimumFare) : 0,
      minimumFare: minimumFare != null ? Number(minimumFare) : 0,
      maxDiscount: maxDiscount != null ? Number(maxDiscount) : null,
      validFrom: validFrom ? new Date(validFrom) : null,
      validUntil: expiresAt,
      expiresAt,
      usageLimit: usageLimit != null ? Number(usageLimit) : 0,
      description: description || "",
      eligibility: req.body?.eligibility || "All eligible users",
      isNewUserOnly: req.body?.isNewUserOnly === true,
      isActive,
      active: isActive,
    });
    void logAdminAction({
      adminId: req.admin?._id,
      action: "create_coupon",
      targetType: "other",
      targetId: String(coupon._id),
      newValue: { code: coupon.code, discountValue: coupon.discountValue },
      req,
    });
    return ok(res, req, 201, "Coupon created", { coupon });
  } catch (err) {
    return fail(res, req, 500, err.message || "Failed to create coupon");
  }
};

module.exports.deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Coupon.findByIdAndDelete(id);
    if (!deleted) return fail(res, req, 404, "Coupon not found");
    void logAdminAction({
      adminId: req.admin?._id,
      action: "delete_coupon",
      targetType: "other",
      targetId: id,
      oldValue: { code: deleted.code },
      req,
    });
    return ok(res, req, 200, "Coupon deleted");
  } catch (err) {
    return fail(res, req, 500, err.message || "Failed to delete coupon");
  }
};

/** System Configuration */
module.exports.getConfig = async (req, res) => {
  try {
    const svcDoc = await pricingService.ensureServiceDoc();
    return ok(res, req, 200, "Config", {
      commissionPercent: svcDoc?.commissionPercent ?? 15,
      launchTrialDays: svcDoc?.launchTrialDays ?? 0,
      serviceAreas: svcDoc?.serviceAreas || ["Kolhapur", "Ichalkaranji", "Sangli"],
      nodeEnv: process.env.NODE_ENV || "development",
    });
  } catch (err) {
    return fail(res, req, 500, err.message || "Failed to load config");
  }
};

module.exports.updateConfig = async (req, res) => {
  try {
    const { commissionPercent, launchTrialDays, serviceAreas } = req.body || {};
    const meta = {};
    if (commissionPercent != null) meta.commissionPercent = Number(commissionPercent);
    if (launchTrialDays != null) meta.launchTrialDays = Number(launchTrialDays);
    if (Array.isArray(serviceAreas)) meta.serviceAreas = serviceAreas;

    await pricingService.updateServiceMeta(meta);
    void logAdminAction({
      adminId: req.admin?._id,
      action: "update_config",
      targetType: "config",
      targetId: "services_doc",
      newValue: meta,
      req,
    });
    const updated = await pricingService.ensureServiceDoc();
    return ok(res, req, 200, "Config updated", {
      commissionPercent: updated?.commissionPercent,
      launchTrialDays: updated?.launchTrialDays,
      serviceAreas: updated?.serviceAreas,
    });
  } catch (err) {
    return fail(res, req, 500, err.message || "Failed to update config");
  }
};


