const CaptainOnboarding = require("../models/captainOnboarding.model");
const captainModel = require("../models/captain.model");

const ALLOWED_CITIES = ["Kolhapur", "Ichalkaranji", "Sangli"];
const ALLOWED_VEHICLE_TYPES = ["BIKE", "AUTO", "CAR"];

const SECTION_FIELDS = {
  personalInformation: [
    "legalFullName",
    "dateOfBirth",
    "mobileNumber",
    "gender",
    "residentialAddress",
    "servingCity",
    "profilePhoto",
  ],
  identityVerification: [
    "identityDocumentType",
    "identityDocumentNumber",
    "nameAsPerIdentityDocument",
    "dateOfBirthAsPerIdentityDocument",
    "identityDocumentFront",
    "identityDocumentBack",
  ],
  drivingLicence: [
    "drivingLicenceNumber",
    "nameAsPerDrivingLicence",
    "dateOfBirthAsPerDrivingLicence",
    "licenceClass",
    "licenceIssueDate",
    "licenceExpiryDate",
    "drivingLicenceFront",
    "drivingLicenceBack",
  ],
  vehicleInformation: [
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

function onboardingError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function assertSection(section) {
  if (!Object.prototype.hasOwnProperty.call(SECTION_FIELDS, section)) {
    throw onboardingError("Invalid onboarding section", 400);
  }
}

function assertFields(section, fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw onboardingError("Section fields must be a non-empty array", 400);
  }

  const invalidFields = fields.filter(
    (field) =>
      typeof field !== "string" || !SECTION_FIELDS[section].includes(field),
  );
  if (invalidFields.length) {
    throw onboardingError("Invalid onboarding section field", 400);
  }
}

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw onboardingError(`${field} is required`, 400);
  }
  return value.trim();
}

function validateSubmission(onboarding) {
  const personal = onboarding.personalInformation || {};
  const licence = onboarding.drivingLicence || {};
  const vehicle = onboarding.vehicleInformation || {};
  const servingCity = requiredText(personal.servingCity, "servingCity");
  const drivingLicenceNumber = requiredText(
    licence.drivingLicenceNumber,
    "drivingLicenceNumber",
  );
  const vehicleRegistrationNumber = requiredText(
    vehicle.vehicleRegistrationNumber,
    "vehicleRegistrationNumber",
  );
  const vehicleType = requiredText(vehicle.vehicleType, "vehicleType").toUpperCase();

  if (!ALLOWED_CITIES.includes(servingCity)) {
    throw onboardingError("Invalid servingCity", 400);
  }
  if (!ALLOWED_VEHICLE_TYPES.includes(vehicleType)) {
    throw onboardingError("Invalid vehicleType", 400);
  }
  if (drivingLicenceNumber.length < 5) {
    throw onboardingError("Invalid drivingLicenceNumber", 400);
  }
  if (vehicleRegistrationNumber.length < 3) {
    throw onboardingError("Invalid vehicleRegistrationNumber", 400);
  }

  return {
    servingCity,
    vehicleType,
    license: drivingLicenceNumber,
    vehicleNumber: vehicleRegistrationNumber,
  };
}

async function getOrCreateOnboarding(captainId) {
  const existing = await CaptainOnboarding.findOne({ captainId });
  if (existing) return existing;

  try {
    return await CaptainOnboarding.create({ captainId });
  } catch (err) {
    if (err?.code !== 11000) throw err;
    return CaptainOnboarding.findOne({ captainId });
  }
}

async function getOnboarding(captainId) {
  return CaptainOnboarding.findOne({ captainId });
}

async function updateSection(captainId, section, updates) {
  assertSection(section);
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    throw onboardingError("Section updates must be an object", 400);
  }

  const updateFields = Object.keys(updates);
  assertFields(section, updateFields);
  const existing = await CaptainOnboarding.findOne({ captainId });
  if (existing && existing.onboardingStatus !== "draft") {
    throw onboardingError(
      "Captain onboarding cannot be updated after submission",
      409,
    );
  }

  const $set = Object.fromEntries(
    updateFields.map((field) => [`${section}.${field}`, updates[field]]),
  );
  let onboarding;
  try {
    onboarding = await CaptainOnboarding.findOneAndUpdate(
      { captainId },
      { $set, $setOnInsert: { captainId } },
      { new: true, upsert: true, runValidators: true },
    );
  } catch (err) {
    if (err?.code !== 11000) throw err;
    onboarding = await CaptainOnboarding.findOneAndUpdate(
      { captainId },
      { $set },
      { new: true, runValidators: true },
    );
  }
  if (!onboarding) throw onboardingError("Captain onboarding not found", 404);
  return onboarding;
}

async function getSection(captainId, section, fields) {
  assertSection(section);

  const projection = { _id: 0 };
  if (fields == null) {
    projection[section] = 1;
  } else {
    assertFields(section, fields);
    for (const field of fields) {
      projection[`${section}.${field}`] = 1;
    }
  }

  const onboarding = await CaptainOnboarding.findOne(
    { captainId },
    projection,
  ).lean();
  return onboarding ? onboarding[section] : null;
}

async function getAllOnboarding(captainId) {
  return CaptainOnboarding.findOne({ captainId });
}

async function submitOnboarding(captainId) {
  const onboarding = await CaptainOnboarding.findOne({ captainId });
  if (!onboarding) throw onboardingError("Captain onboarding not found", 404);
  if (onboarding.onboardingStatus !== "draft") {
    throw onboardingError(
      "Captain onboarding cannot be submitted in its current status",
      409,
    );
  }

  const captainFields = validateSubmission(onboarding);

  const submitted = await CaptainOnboarding.findOneAndUpdate(
    { captainId, onboardingStatus: "draft" },
    { $set: { onboardingStatus: "submitted", submittedAt: new Date() } },
    { new: true },
  );
  if (!submitted) {
    throw onboardingError(
      "Captain onboarding cannot be submitted in its current status",
      409,
    );
  }

  const captain = await captainModel.findByIdAndUpdate(
    captainId,
    { $set: captainFields },
    { new: true, runValidators: true },
  );
  if (!captain) throw onboardingError("Captain not found", 404);

  return submitted;
}

module.exports = {
  getOrCreateOnboarding,
  getOnboarding,
  updateSection,
  getSection,
  getAllOnboarding,
  submitOnboarding,
};
