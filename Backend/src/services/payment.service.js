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

/**
 * Pre-ride advance share of the payable fare. The rest is collected by the
 * existing final-payment flow — this is THE one source for that split.
 */
const ADVANCE_PERCENTAGE = 25;

/** Paise-exact rounding, so the amount charged always equals the amount stored. */
function roundAmount(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Authoritative advance split for a ride, recomputed from the persisted fare.
 * A client-sent amount is never trusted.
 */
function computeAdvanceSplit(ride) {
  const payable = roundAmount(
    Math.max(0, Number(ride?.price || 0) - Number(ride?.discountAmount || 0)),
  );
  const advanceAmount = roundAmount((payable * ADVANCE_PERCENTAGE) / 100);
  return {
    payable,
    advanceAmount,
    remainingAmount: roundAmount(Math.max(0, payable - advanceAmount)),
  };
}

/**
 * Record a provider-verified advance payment and flip the ride's advance fields.
 *
 * Shared by the verify endpoint, the order-reconciliation path and the Razorpay
 * webhook so all three write identical state, and keyed on the ledger's unique
 * (rideId, ride_fare, advance) row so a repeat delivery can never double-charge.
 *
 * @returns {Promise<object|null>} populated ride, or null when the ride is gone
 */
async function confirmRideAdvancePaid({
  rideId,
  transactionId,
  amount = null,
  paymentMode = "Online",
}) {
  const ride = await rideModel.findById(rideId);
  if (!ride) return null;

  const { payable, advanceAmount } = computeAdvanceSplit(ride);
  const capturedAmount = roundAmount(
    Number.isFinite(Number(amount)) && Number(amount) > 0
      ? Number(amount)
      : advanceAmount,
  );
  const ref = String(transactionId || "").trim();
  if (!ref) throw new Error("A verified transaction id is required");

  const ledgerQuery = { rideId: ride._id, paymentType: "ride_fare", paymentPart: "advance" };
  const ledgerUpdate = {
    $set: {
      userId: ride.user,
      driverId: ride.captain || null,
      amount: capturedAmount,
      discountAmount: Number(ride.discountAmount || 0),
      originalFare: Number(ride.originalFare ?? ride.price ?? 0),
      finalPayableAmount: payable,
      paymentMode,
      paymentStatus: "success",
      paymentType: "ride_fare",
      paymentPart: "advance",
      externalRef: ref,
    },
  };
  try {
    await PaymentRecord.findOneAndUpdate(ledgerQuery, ledgerUpdate, { upsert: true, new: true });
  } catch (e) {
    /** The app callback and the webhook can land together — one of them loses the insert race. */
    if (e?.code !== 11000) throw e;
    await PaymentRecord.updateOne(ledgerQuery, ledgerUpdate);
  }

  /**
   * Only the advance is marked settled here: `paymentStatus` and `chargedAmount`
   * stay untouched so the remaining fare keeps following the existing
   * completion flow.
   */
  return rideModel
    .findByIdAndUpdate(
      ride._id,
      {
        $set: {
          advancePaymentRequired: true,
          advancePercentage: ADVANCE_PERCENTAGE,
          advanceAmount: capturedAmount,
          advancePaymentStatus: "success",
          advancePaymentState: "paid",
          advancePaymentTransactionId: ref,
          remainingAmount: roundAmount(Math.max(0, payable - capturedAmount)),
        },
      },
      { new: true },
    )
    .populate("user", "name phone email")
    .populate("captain");
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
          discountAmount: Number(populated.discountAmount || 0),
          couponCode: populated.couponCode || "",
          originalFare: Number(populated.originalFare ?? populated.price ?? 0),
          finalPayableAmount: payableAmount,
          paymentMode: populated.paymentMethod || "Cash",
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
          "paymentStatus captainNetEarning price discountAmount couponCode captain",
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

      if (ride.couponCode) {
        const { settleCouponRedemption } = require("./coupon.service");
        await settleCouponRedemption({ rideId: rid, session });
      }

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
  ADVANCE_PERCENTAGE,
  roundAmount,
  computeAdvanceSplit,
  confirmRideAdvancePaid,
};