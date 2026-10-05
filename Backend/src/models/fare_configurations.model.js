const mongoose = require("mongoose");

const fareConfigurationSchema = new mongoose.Schema(
  {
    key: { type: String, default: "global", unique: true },
    rideType: { type: String, default: "AUTO" },
    cityZone: { type: String, default: "Kolhapur" },
    status: { type: String, default: "DRAFT" },
    effectiveFrom: { type: Date, default: null },
    effectiveTo: { type: Date, default: null },
    rates: {
      BIKE: { baseFare: Number, perKm: Number, platformFee: Number },
      AUTO: { baseFare: Number, perKm: Number, platformFee: Number },
      CAR: { baseFare: Number, perKm: Number, platformFee: Number },
    },
    version: { type: String, default: "v1" },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "fare_configurations" }
);

module.exports =
  mongoose.models.FareConfiguration ||
  mongoose.model('FareConfiguration', fareConfigurationSchema);