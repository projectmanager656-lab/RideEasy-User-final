jest.mock("../../models/captainOnboarding.model", () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../../models/captain.model", () => ({
  findByIdAndUpdate: jest.fn(),
}));

const CaptainOnboarding = require("../../models/captainOnboarding.model");
const captainModel = require("../../models/captain.model");
const onboardingService = require("../../services/captainOnboarding.service");
const {
  personalInformationValidators,
  vehicleInformationValidators,
} = require("../../validators/captainOnboarding.validators");
const { validationResult } = require("express-validator");

async function validate(validators, body) {
  const req = { body, params: {}, query: {} };
  for (const validator of validators) await validator.run(req);
  return validationResult(req).array();
}

describe("captain onboarding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("submits valid operational onboarding and updates the captain", async () => {
    const onboarding = {
      onboardingStatus: "draft",
      personalInformation: { servingCity: "Kolhapur" },
      drivingLicence: { drivingLicenceNumber: "LIC12345" },
      vehicleInformation: {
        vehicleRegistrationNumber: "MH12AB1234",
        vehicleType: "AUTO",
      },
    };
    CaptainOnboarding.findOne.mockResolvedValue(onboarding);
    CaptainOnboarding.findOneAndUpdate.mockResolvedValue({
      ...onboarding,
      onboardingStatus: "submitted",
    });
    captainModel.findByIdAndUpdate.mockResolvedValue({ _id: "captain-id" });

    await onboardingService.submitOnboarding("captain-id");

    expect(captainModel.findByIdAndUpdate).toHaveBeenCalledWith(
      "captain-id",
      {
        $set: {
          servingCity: "Kolhapur",
          vehicleType: "AUTO",
          vehicleNumber: "MH12AB1234",
          license: "LIC12345",
        },
      },
      { new: true, runValidators: true },
    );
  });

  test("rejects submission when required operational data is missing", async () => {
    CaptainOnboarding.findOne.mockResolvedValue({
      onboardingStatus: "draft",
      personalInformation: { servingCity: "Kolhapur" },
      drivingLicence: {},
      vehicleInformation: { vehicleType: "AUTO" },
    });

    await expect(
      onboardingService.submitOnboarding("captain-id"),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(CaptainOnboarding.findOneAndUpdate).not.toHaveBeenCalled();
    expect(captainModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test("rejects onboarding updates after submission", async () => {
    CaptainOnboarding.findOne.mockResolvedValue({ onboardingStatus: "submitted" });

    await expect(
      onboardingService.updateSection("captain-id", "personalInformation", {
        servingCity: "Sangli",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(CaptainOnboarding.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("rejects bank details and invalid vehicle values in section requests", async () => {
    expect(
      (await validate(personalInformationValidators, {
        bankDetails: { accountNumber: "123456789" },
      })).length,
    ).toBeGreaterThan(0);
    expect(
      (await validate(vehicleInformationValidators, { vehicleType: "TRUCK" })).length,
    ).toBeGreaterThan(0);
  });
});
