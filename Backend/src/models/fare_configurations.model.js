const mongoose = require("mongoose");

const fareConfigurationSchema = new mongoose.Schema(
  {
    rideType: { type: String, required: true },
    cityZone: { type: String, required: true },
    version: { type: mongoose.Schema.Types.Mixed, default: 1 },
    baseFare: { type: Number, default: 0 },
    distanceRate: { type: Number, default: 0 },
    timeRate: { type: Number, default: 0 },
    minimumFare: { type: Number, default: 0 },
    fees: { type: Number, default: 0 },
    registrationFee: { type: Number, default: 0 },
    minimumWalletBalance: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    effectiveFrom: { type: Date, default: null },
    effectiveTo: { type: Date, default: null },
    status: { type: String, default: "ACTIVE" },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    rates: { type: mongoose.Schema.Types.Mixed, default: null },
    key: { type: String, default: null },
  },
  { timestamps: true, collection: "fare_configurations", strict: false }
);

module.exports =
  mongoose.models.FareConfiguration ||
  mongoose.model("FareConfiguration", fareConfigurationSchema);