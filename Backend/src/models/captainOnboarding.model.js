const mongoose = require("mongoose");

const captainOnboardingSchema = new mongoose.Schema(
  {
    captainId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "captain",
      required: true,
      unique: true,
      index: true,
    },
    personalInformation: {
      legalFullName: { type: String },
      dateOfBirth: { type: Date },
      mobileNumber: { type: String },
      gender: { type: String },
      residentialAddress: { type: String },
      servingCity: { type: String },
      profilePhoto: { type: String },
    },
    identityVerification: {
      identityDocumentType: { type: String },
      identityDocumentNumber: { type: String },
      nameAsPerIdentityDocument: { type: String },
      dateOfBirthAsPerIdentityDocument: { type: Date },
      identityDocumentFront: { type: String },
      identityDocumentBack: { type: String },
    },
    drivingLicence: {
      drivingLicenceNumber: { type: String },
      nameAsPerDrivingLicence: { type: String },
      dateOfBirthAsPerDrivingLicence: { type: Date },
      licenceClass: { type: String },
      licenceIssueDate: { type: Date },
      licenceExpiryDate: { type: Date },
      drivingLicenceFront: { type: String },
      drivingLicenceBack: { type: String },
    },
    vehicleInformation: {
      vehicleRegistrationNumber: { type: String },
      vehicleType: { type: String },
      vehicleManufacturer: { type: String },
      vehicleModel: { type: String },
      manufacturingYear: { type: Number },
      fuelType: { type: String },
      seatingCapacity: { type: Number },
      vehicleOwnershipType: { type: String },
      rcNumber: { type: String },
      nameAsPerRC: { type: String },
      rcDocumentFront: { type: String },
      rcDocumentBack: { type: String },
    },
    insurance: {
      insurancePolicyNumber: { type: String },
      policyHolderName: { type: String },
      insuranceExpiryDate: { type: Date },
      insuranceCertificate: { type: String },
    },
    registrationFee: {
      status: {
        type: String,
        enum: ["pending", "paid", "failed"],
        default: "pending",
      },
      amount: {
        type: Number,
        default: null,
      },
      paidAt: {
        type: Date,
        default: null,
      },
      registrationPaymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "RegistrationPayment",
        default: null,
      },
    },
    onboardingStatus: {
      type: String,
      enum: ["draft", "submitted", "approved", "rejected"],
      default: "draft",
    },
    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
  },
  { timestamps: true, collection: "captain_onboardings" },
);

module.exports = mongoose.model("CaptainOnboarding", captainOnboardingSchema);
