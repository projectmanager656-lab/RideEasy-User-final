jest.mock("../../models/admin.model", () => ({}));
jest.mock("../../models/user.model", () => ({
  countDocuments: jest.fn(),
}));
jest.mock("../../models/captain.model", () => ({
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
}));
jest.mock("../../models/paymentRecord.model", () => ({}));
jest.mock("../../models/captainOnboarding.model", () => ({}));
jest.mock("../../models/rideCore.model", () => ({
  countDocuments: jest.fn(),
  find: jest.fn(),
  aggregate: jest.fn(),
  collection: { collectionName: "rides" },
}));
jest.mock("../../services/pricing.service", () => ({
  getCommissionPercent: jest.fn(),
}));

const User = require("../../models/user.model");
const Captain = require("../../models/captain.model");
const CaptainOnboarding = require("../../models/captainOnboarding.model");
const Ride = require("../../models/rideCore.model");
const pricingService = require("../../services/pricing.service");
const adminController = require("../../controllers/admin.controller");
const mongoose = require("mongoose");

function responseFor() {
  const response = {};
  response.status = jest.fn(() => response);
  response.json = jest.fn(() => response);
  return response;
}

function findQuery(value) {
  return {
    select: jest.fn(() => Promise.resolve(value)),
  };
}

function configureAnalyticsMocks() {
  User.countDocuments.mockResolvedValue(1);
  Captain.countDocuments.mockResolvedValue(1);
  Ride.countDocuments.mockResolvedValue(1);
  Ride.find.mockReturnValue(findQuery([{ price: 100, city: "Kolhapur" }]));
  Captain.aggregate.mockResolvedValue([]);
}

function platformPipelineFromAnalytics() {
  return Ride.aggregate.mock.calls.find((call) =>
    call[0]?.some((stage) => stage.$addFields?.effPlatformFee),
  )[0];
}

describe("admin commission reporting", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.COMMISSION_PERCENT = "15";
    pricingService.getCommissionPercent.mockResolvedValue(20);
    configureAnalyticsMocks();
    Ride.aggregate.mockImplementation(async (pipeline) => {
      if (pipeline.some((stage) => stage.$addFields?.effPlatformFee)) {
        return [{ platformIncome: 20 }];
      }
      return [];
    });
  });

  test("uses the current Admin commission for missing historical platformFee", async () => {
    const response = responseFor();

    await adminController.getAnalytics({}, response);

    expect(pricingService.getCommissionPercent).toHaveBeenCalledTimes(1);
    const feeExpression = platformPipelineFromAnalytics()[1].$addFields.effPlatformFee;
    expect(feeExpression.$cond[0]).toEqual({ $ne: ["$platformFee", null] });
    expect(feeExpression.$cond[2]).toEqual({
      $multiply: [{ $ifNull: ["$price", 0] }, 0.2],
    });
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ platformIncomeTotal: 20 }) }),
    );
  });

  test("preserves a stored platformFee of 15 instead of recalculating at 20 percent", async () => {
    Ride.find.mockReturnValue(findQuery([{ price: 100, platformFee: 15 }]));
    const response = responseFor();

    await adminController.getAnalytics({}, response);

    const feeExpression = platformPipelineFromAnalytics()[1].$addFields.effPlatformFee;
    expect(feeExpression.$cond[1]).toBe("$platformFee");
    expect(feeExpression.$cond[2].$multiply[1]).toBe(0.2);
  });

  test("preserves a stored platformFee of zero", async () => {
    Ride.find.mockReturnValue(findQuery([{ price: 100, platformFee: 0 }]));
    const response = responseFor();

    await adminController.getAnalytics({}, response);

    const feeExpression = platformPipelineFromAnalytics()[1].$addFields.effPlatformFee;
    expect(feeExpression.$cond[0]).toEqual({ $ne: ["$platformFee", null] });
    expect(feeExpression.$cond[1]).toBe("$platformFee");
  });

  test("uses a changed Admin commission for the next legacy report calculation", async () => {
    pricingService.getCommissionPercent.mockResolvedValueOnce(15).mockResolvedValueOnce(20);
    const firstResponse = responseFor();
    await adminController.getAnalytics({}, firstResponse);
    const firstPipeline = platformPipelineFromAnalytics();

    const secondResponse = responseFor();
    await adminController.getAnalytics({}, secondResponse);
    const secondPipeline = Ride.aggregate.mock.calls
      .filter((call) => call[0]?.some((stage) => stage.$addFields?.effPlatformFee))
      .map((call) => call[0]);

    expect(firstPipeline[1].$addFields.effPlatformFee.$cond[2].$multiply[1]).toBe(0.15);
    expect(secondPipeline[1][1].$addFields.effPlatformFee.$cond[2].$multiply[1]).toBe(0.2);
  });

  test("uses the same Admin-configured fallback in driver reporting", async () => {
    Captain.aggregate.mockImplementation(async (pipeline) => {
      const lookupPipeline = pipeline[2].$lookup.pipeline;
      const feeExpression = lookupPipeline[1].$addFields.effPlatformFee;
      expect(feeExpression.$cond[0]).toEqual({ $ne: ["$platformFee", null] });
      expect(feeExpression.$cond[2]).toEqual({
        $multiply: [{ $ifNull: ["$price", 0] }, 0.2],
      });
      return [];
    });

    await adminController.getDrivers({}, responseFor());
    expect(pricingService.getCommissionPercent).toHaveBeenCalledTimes(1);
  });
});

describe("admin driver approval", () => {
  test("normalizes the driver id and synchronizes onboarding approval", async () => {
    const captainId = new mongoose.Types.ObjectId();
    const onboarding = {
      select: jest.fn().mockResolvedValue({
        personalInformation: { servingCity: "Kolhapur" },
        vehicleInformation: { vehicleType: "AUTO" },
      }),
    };
    const driver = {
      select: jest.fn().mockResolvedValue({ _id: captainId, approved: true }),
    };
    const onboardingUpdate = jest.fn().mockResolvedValue({
      onboardingStatus: "approved",
    });
    CaptainOnboarding.findOne = jest.fn(() => onboarding);
    CaptainOnboarding.findOneAndUpdate = onboardingUpdate;
    Captain.findByIdAndUpdate = jest.fn(() => driver);

    await adminController.approveDriver(
      { params: { id: String(captainId) } },
      responseFor(),
    );

    expect(CaptainOnboarding.findOne).toHaveBeenCalledWith({ captainId });
    expect(Captain.findByIdAndUpdate).toHaveBeenCalledWith(
      captainId,
      expect.objectContaining({ approved: true }),
      { new: true },
    );
    expect(onboardingUpdate).toHaveBeenCalledWith(
      { captainId, onboardingStatus: { $in: ["submitted", "approved"] } },
      { $set: { onboardingStatus: "approved", approvedAt: expect.any(Date), rejectedAt: null } },
    );
  });
});