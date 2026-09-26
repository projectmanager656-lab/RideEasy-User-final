const { body, param, query, checkExact } = require("express-validator");

const SECTION_NAMES = [
  "personal-information",
  "identity-verification",
  "driving-licence",
  "vehicle-information",
  "insurance",
];

const SECTION_FIELDS = {
  "personal-information": [
    "legalFullName",
    "dateOfBirth",
    "mobileNumber",
    "gender",
    "residentialAddress",
    "servingCity",
    "profilePhoto",
  ],
  "identity-verification": [
    "identityDocumentType",
    "identityDocumentNumber",
    "nameAsPerIdentityDocument",
    "dateOfBirthAsPerIdentityDocument",
    "identityDocumentFront",
    "identityDocumentBack",
  ],
  "driving-licence": [
    "drivingLicenceNumber",
    "nameAsPerDrivingLicence",
    "dateOfBirthAsPerDrivingLicence",
    "licenceClass",
    "licenceIssueDate",
    "licenceExpiryDate",
    "drivingLicenceFront",
    "drivingLicenceBack",
  ],
  "vehicle-information": [
    "vehicleRegistrationNumber",
    "vehicleType",
    "vehicleManufacturer",
    "vehicleModel",
    "manufacturingYear",
    "fuelType",
    "seatingCapacity",
    "vehicleOwnershipType",
    "rcNumber",
    "nameAsPerRC",
    "rcDocumentFront",
    "rcDocumentBack",
  ],
  insurance: [
    "insurancePolicyNumber",
    "policyHolderName",
    "insuranceExpiryDate",
    "insuranceCertificate",
  ],
};

function optionalString(field) {
  return body(field).optional().isString();
}

function optionalEnum(field, values) {
  return body(field).optional().isString().isIn(values);
}

function optionalDate(field) {
  return body(field).optional().isString().isISO8601({ strict: true });
}

function optionalNumber(field, { positive = false } = {}) {
  return body(field)
    .optional()
    .custom((value) => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${field} must be a valid number`);
      }
      if (positive && value <= 0) {
        throw new Error(`${field} must be a positive number`);
      }
      return true;
    });
}

function sectionPatchValidators(chains) {
  return [...chains, checkExact(chains, { locations: ["body"] })];
}

const personalInformationValidators = sectionPatchValidators([
  optionalString("legalFullName"),
  optionalDate("dateOfBirth"),
  optionalString("mobileNumber"),
  optionalString("gender"),
  optionalString("residentialAddress"),
  optionalEnum("servingCity", ["Kolhapur", "Ichalkaranji", "Sangli"]),
  optionalString("profilePhoto"),
]);

const identityVerificationValidators = sectionPatchValidators([
  optionalString("identityDocumentType"),
  optionalString("identityDocumentNumber"),
  optionalString("nameAsPerIdentityDocument"),
  optionalDate("dateOfBirthAsPerIdentityDocument"),
  optionalString("identityDocumentFront"),
  optionalString("identityDocumentBack"),
]);

const drivingLicenceValidators = sectionPatchValidators([
  optionalString("drivingLicenceNumber"),
  optionalString("nameAsPerDrivingLicence"),
  optionalDate("dateOfBirthAsPerDrivingLicence"),
  optionalString("licenceClass"),
  optionalDate("licenceIssueDate"),
  optionalDate("licenceExpiryDate"),
  optionalString("drivingLicenceFront"),
  optionalString("drivingLicenceBack"),
]);

const vehicleInformationValidators = sectionPatchValidators([
  optionalString("vehicleRegistrationNumber"),
  optionalEnum("vehicleType", ["BIKE", "AUTO", "CAR"]),
  optionalString("vehicleManufacturer"),
  optionalString("vehicleModel"),
  optionalNumber("manufacturingYear"),
  optionalString("fuelType"),
  optionalNumber("seatingCapacity", { positive: true }),
  optionalString("vehicleOwnershipType"),
  optionalString("rcNumber"),
  optionalString("nameAsPerRC"),
  optionalString("rcDocumentFront"),
  optionalString("rcDocumentBack"),
]);

const insuranceValidators = sectionPatchValidators([
  optionalString("insurancePolicyNumber"),
  optionalString("policyHolderName"),
  optionalDate("insuranceExpiryDate"),
  optionalString("insuranceCertificate"),
]);

const onboardingSectionValidators = [param("section").isIn(SECTION_NAMES)];

const selectedFieldValidators = [
  ...onboardingSectionValidators,
  query("fields")
    .optional()
    .isString()
    .custom((value, { req }) => {
      const section = req.params?.section;
      const fields = value.split(",").map((field) => field.trim());
      if (!section || fields.length === 0 || fields.some((field) => !field)) {
        throw new Error("fields must be a comma-separated list");
      }
      if (fields.some((field) => !SECTION_FIELDS[section]?.includes(field))) {
        throw new Error("Invalid onboarding section field");
      }
      return true;
    }),
];

const submitOnboardingValidators = [checkExact([], { locations: ["body"] })];

module.exports = {
  personalInformationValidators,
  identityVerificationValidators,
  drivingLicenceValidators,
  vehicleInformationValidators,
  insuranceValidators,
  onboardingSectionValidators,
  selectedFieldValidators,
  submitOnboardingValidators,
};
