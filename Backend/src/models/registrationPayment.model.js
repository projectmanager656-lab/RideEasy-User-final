const mongoose = require("mongoose");

const registrationPaymentSchema = new mongoose.Schema(
  {
    captainId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "captain",
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    razorpayOrderId: {
      type: String,
      trim: true,
      index: true,
      default: null,
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },

    paymentMethod: {
      type: String,
      enum: ["UPI", "CARD", "NET_BANKING"],
      default: null,
    },

    transactionId: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    failureReason: {
      type: String,
      maxlength: 500,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "registration_payments",
  },
);

registrationPaymentSchema.index({ captainId: 1, createdAt: -1 });

registrationPaymentSchema.index(
  { transactionId: 1 },
  {
    unique: true,
    sparse: true,
  },
);

module.exports = mongoose.model(
  "RegistrationPayment",
  registrationPaymentSchema,
);
