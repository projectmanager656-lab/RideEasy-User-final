const mongoose = require("mongoose");

/**
 * RideEasy Support hotlines (collection `rideeasy_support`, managed in Atlas).
 * The active record with the highest priority is what client apps dial from
 * the emergency-support flow. No REST writes — the RideEasy team maintains it.
 */
const rideeasySupportSchema = new mongoose.Schema(
  {
    name: { type: String, default: "RideEasy Support" },
    phone: { type: String, default: "" },
    description: { type: String, default: "" },
    type: { type: String, default: "EMERGENCY_SUPPORT" },
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "rideeasy_support" },
);

module.exports = mongoose.model("RideeasySupport", rideeasySupportSchema);
