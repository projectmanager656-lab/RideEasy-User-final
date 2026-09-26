const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { signPayload } = require("../config/jwt.config");

const captainSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, minlength: 2 },
    phone: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: false },
    socketId: { type: String },
    busy: { type: Boolean, default: false },
    vehicleType: {
      type: String,
      required: false,
      enum: ["BIKE", "AUTO", "CAR"],
    },
    vehicleNumber: {
      type: String,
      required: false,
      minlength: 3,
    },
    license: {
      type: String,
      required: false,
      minlength: 5,
    },
    servingCity: {
      type: String,
      required: false,
      trim: true,
      enum: ["Kolhapur", "Ichalkaranji", "Sangli"],
    },
    /** Mirrors active socket presence; used with status for ride matching. */
    isOnline: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "inactive"], default: "inactive" }, // online/offline
    approved: { type: Boolean, default: false },
    blocked: { type: Boolean, default: false },
    subscriptionStatus: {
      type: String,
      enum: ["active", "expired", "none"],
      default: "none",
    },
    /** weekly | monthly | yearly — last purchased plan */
    subscriptionPlan: { type: String, default: null },
    subscriptionStartedAt: { type: Date },
    subscriptionExpiresAt: { type: Date },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },
    lastLocationUpdatedAt: { type: Date },
    walletBalance: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    ratingSum: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    driverCancelCount: { type: Number, default: 0 },
    lastCancelWarningAt: { type: Date },
    loginOtp: { type: String, select: false },
    loginOtpExpiresAt: { type: Date, select: false },
  },
  { timestamps: true, collection: "drivers" },
);

captainSchema.index({ location: "2dsphere" });

captainSchema.virtual("averageRating").get(function () {
  if (!this.ratingCount) return 0;
  return Math.round((this.ratingSum / this.ratingCount) * 10) / 10;
});
captainSchema.set("toJSON", { virtuals: true });
captainSchema.set("toObject", { virtuals: true });

captainSchema.methods.generateAuthToken = function () {
  return signPayload({ _id: this._id, role: "captain" });
};

captainSchema.methods.comparePassword = async function (password) {
  try {
    if (password == null || typeof password !== "string" || !this.password)
      return false;
    return await bcrypt.compare(password, this.password);
  } catch (err) {
    console.error("[captain] comparePassword error:", err.message);
    return false;
  }
};

captainSchema.statics.hashPassword = async function (password) {
  return await bcrypt.hash(password, 10);
};

module.exports = mongoose.model("captain", captainSchema);
