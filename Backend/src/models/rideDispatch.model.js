const mongoose = require("mongoose");

/**
 * ONE record per (ride, matched captain) describing what actually happened when the
 * ride offer was dispatched over Socket.IO. "matched" and "delivered" are deliberately
 * separate: a captain can be matched by the eligibility query while having no live
 * socket, in which case the record ends `failed` with `failureReason`.
 *
 * Durable tracking only — the live Socket.IO adapter room remains the delivery
 * authority; this collection never targets a socket.
 */
const rideDispatchSchema = new mongoose.Schema(
  {
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      // Matches the model registered in rideCore.model.js (`mongoose.model('ride', …)`).
      ref: "ride",
      required: true,
      index: true,
    },

    captainId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "captain",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: [
        "matched",
        "dispatching",
        "delivered",
        "acknowledged",
        "failed",
        "expired",
        "cancelled",
      ],
      default: "matched",
      index: true,
    },

    socketIdAtDispatch: {
      type: String,
      default: null,
    },

    socketRoom: {
      type: String,
      default: null,
    },

    socketConnected: {
      type: Boolean,
      default: false,
    },

    socketDelivered: {
      type: Boolean,
      default: false,
    },

    driverAcknowledged: {
      type: Boolean,
      default: false,
    },

    failureReason: {
      type: String,
      default: null,
    },

    matchedAt: {
      type: Date,
      default: Date.now,
    },

    dispatchAttemptedAt: {
      type: Date,
      default: null,
    },

    deliveredAt: {
      type: Date,
      default: null,
    },

    acknowledgedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "ride_dispatches",
  }
);

rideDispatchSchema.index(
  { rideId: 1, captainId: 1 },
  { unique: true }
);

module.exports = mongoose.model("RideDispatch", rideDispatchSchema);
