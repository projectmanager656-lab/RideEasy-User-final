/**
 * Cash ride-payment settlement after the captain confirms receipt.
 * Platform commission from ./pricing.service keeps the ledger consistent.
 */
const mongoose = require("mongoose");
const rideModel = require("../models/rideCore.model");
const captainModel = require("../models/captain.model");
const PaymentRecord = require("../models/paymentRecord.model");
const pricingService = require("./pricing.service");
const logger = require("../utils/logger");

function captainRefToId(c) {
  if (c == null) return null;

  try {
    if (typeof c === "object" && c._id != null) {
      return String(c._id);
    }

    return String(c);
  } catch {
    return null;
  }
}

async function recordRideFareLedger(
  rideId,
  payableAmount,
  session = null,
  populatedRide = null,
) {
  const options = session ? { session } : {};

  try {
    const dup = await PaymentRecord.findOne({
      rideId,
      paymentType: "ride_fare",
    }).session(session);

    if (dup) return dup;

    const populated =
      populatedRide ||
      (await rideModel
        .findById(rideId)
        .populate("user")
        .populate("captain")
        .session(session));

    if (!populated) return null;

    return await PaymentRecord.create(
      [
        {
          rideId,
          driverId: populated.captain?._id ?? populated.captain,
          userId: populated.user?._id ?? populated.user,
          amount: payableAmount,
          paymentMode: "Cash",
          paymentStatus: "success",
          paymentType: "ride_fare",
        },
      ],
      options,
    ).then((records) => records[0]);
  } catch (e) {
    logger.payment("ledger ride_fare failed", {
      rideId: String(rideId),
      err: e?.message,
    });
    throw e;
  }
}

/**
 * Atomically settles a successful cash ride.
 *
 * The following operations succeed or fail together:
 * - ride payment status
 * - ride settlement fields
 * - captain wallet balance
 * - captain total earnings
 * - ride fare payment ledger
 *
 * @returns {Promise<object|null>} Populated ride or null
 */
async function settleRidePaymentIfNeeded(rideId) {
  const rid = rideId?.toString
    ? rideId.toString()
    : String(rideId || "");

  if (!rid || !mongoose.isValidObjectId(rid)) {
    return null;
  }

  const commissionPct = await pricingService.getCommissionPercent();
  const pct = Number(commissionPct) / 100;

  const session = await mongoose.startSession();

  try {
    let settledRide = null;

    await session.withTransaction(async () => {
      const ride = await rideModel
        .findOne({
          _id: rid,
          status: "completed",
          paymentStatus: { $in: ["pending", "success"] },
          captainNetEarning: null,
        })
        .select(
          "paymentStatus captainNetEarning price discountAmount captain",
        )
        .session(session);

      if (!ride) {
        return;
      }

      const discountAmount = Number(ride.discountAmount || 0);
      const payableAmount = Math.max(
        0,
        Number(ride.price || 0) - discountAmount,
      );

      const platformFee = Math.round(payableAmount * pct);
      const net = Math.max(0, payableAmount - platformFee);

      const updatedRide = await rideModel.findOneAndUpdate(
        {
          _id: rid,
          status: "completed",
          paymentStatus: { $in: ["pending", "success"] },
          captainNetEarning: null,
        },
        {
          $set: {
            paymentStatus: "success",
            platformFee,
            captainNetEarning: net,
            chargedAmount: payableAmount,
          },
        },
        {
          new: true,
          session,
        },
      );

      if (!updatedRide) {
        return;
      }

      const capId = captainRefToId(updatedRide.captain);

      if (!capId) {
        const error = new Error(
          "Captain is required for ride payment settlement",
        );
        error.statusCode = 400;
        throw error;
      }

      const updatedCaptain = await captainModel.findOneAndUpdate(
        {
          _id: capId,
        },
        [
          {
            $set: {
              walletBalance: {
                $max: [
                  {
                    $subtract: [
                      { $ifNull: ["$walletBalance", 0] },
                      platformFee,
                    ],
                  },
                  0,
                ],
              },
              totalEarnings: {
                $add: [{ $ifNull: ["$totalEarnings", 0] }, net],
              },
            },
          },
        ],
        {
          new: true,
          session,
        },
      );

      if (!updatedCaptain) {
        const error = new Error(
          "Captain not found during payment settlement",
        );
        error.statusCode = 404;
        throw error;
      }

      await recordRideFareLedger(
        rid,
        payableAmount,
        session,
        updatedRide,
      );

      settledRide = updatedRide;
    });

    if (!settledRide) {
      return rideModel
        .findById(rid)
        .populate("user", "name phone email")
        .populate("captain");
    }

    logger.payment("settled", {
      rideId: rid,
      payableAmount: settledRide.chargedAmount,
      platformFee: settledRide.platformFee,
      net: settledRide.captainNetEarning,
    });

    return rideModel
      .findById(rid)
      .populate("user", "name phone email")
      .populate("captain");
  } finally {
    await session.endSession();
  }
}

module.exports = {
  settleRidePaymentIfNeeded,
  captainRefToId,
  recordRideFareLedger,
};