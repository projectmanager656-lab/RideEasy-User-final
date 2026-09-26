jest.mock("../../services/pricing.service", () => ({
  getCaptainPricing: jest.fn(),
}));
jest.mock("../../services/rideCore.service", () => ({
  confirmRide: jest.fn(),
  normalizeVehicleType: jest.fn((value) => value),
  releaseCaptainBusyIfAvailable: jest.fn(),
}));
jest.mock("../../models/captain.model", () => ({
  findById: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../models/rideCore.model", () => ({
  findById: jest.fn(),
}));

const pricingService = require("../../services/pricing.service");
const rideService = require("../../services/rideCore.service");
const captainModel = require("../../models/captain.model");
const rideController = require("../../controllers/ride.controller");

function responseFor() {
  const response = {};
  response.status = jest.fn(() => response);
  response.json = jest.fn(() => response);
  return response;
}

function captainQuery(captain) {
  return {
    select: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue(captain),
    })),
  };
}

describe("captain wallet validation on ride acceptance", () => {
  let consoleError;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    pricingService.getCaptainPricing.mockResolvedValue({
      minimumWalletBalance: 50,
    });
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  test("rejects below-minimum wallet without modifying or confirming the ride", async () => {
    captainModel.findById.mockReturnValue(
      captainQuery({
        walletBalance: 40,
        subscriptionStatus: "active",
        subscriptionExpiresAt: null,
        blocked: false,
      }),
    );
    const response = responseFor();

    await rideController.acceptRide(
      { params: { id: "ride-id" }, captain: { _id: "captain-id" } },
      response,
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Insufficient wallet balance. Add money to accept rides.",
      }),
    );
    expect(rideService.confirmRide).not.toHaveBeenCalled();
  });

  test("rejects a busy captain before checking wallet or claiming a ride", async () => {
    captainModel.findById.mockReturnValue(
      captainQuery({
        busy: true,
        walletBalance: 100,
        subscriptionStatus: "active",
        subscriptionExpiresAt: null,
        blocked: false,
      }),
    );
    const response = responseFor();

    await rideController.acceptRide(
      { params: { id: "ride-id" }, captain: { _id: "captain-id" } },
      response,
    );

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Captain already has an active ride.",
      }),
    );
    expect(pricingService.getCaptainPricing).not.toHaveBeenCalled();
    expect(rideService.confirmRide).not.toHaveBeenCalled();
  });

  test.each([50, 100])("allows wallet balance %i to reach the existing accept flow", async (walletBalance) => {
    captainModel.findById.mockReturnValue(
      captainQuery({
        walletBalance,
        subscriptionStatus: "active",
        subscriptionExpiresAt: null,
        blocked: false,
      }),
    );
    rideService.confirmRide.mockRejectedValue(new Error("existing flow reached"));
    const response = responseFor();

    await rideController.acceptRide(
      { params: { id: "ride-id" }, captain: { _id: "captain-id" } },
      response,
    );

    expect(rideService.confirmRide).toHaveBeenCalledWith({
      rideId: "ride-id",
      captain: { _id: "captain-id" },
    });
    expect(response.status).toHaveBeenCalledWith(400);
  });

  test("treats a missing wallet as zero and rejects it", async () => {
    captainModel.findById.mockReturnValue(
      captainQuery({
        subscriptionStatus: "active",
        subscriptionExpiresAt: null,
        blocked: false,
      }),
    );
    const response = responseFor();

    await rideController.acceptRide(
      { params: { id: "ride-id" }, captain: { _id: "captain-id" } },
      response,
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(rideService.confirmRide).not.toHaveBeenCalled();
  });

  test("preserves the existing blocked-account validation", async () => {
    captainModel.findById.mockReturnValue(
      captainQuery({
        walletBalance: 100,
        subscriptionStatus: "active",
        subscriptionExpiresAt: null,
        blocked: true,
      }),
    );
    const response = responseFor();

    await rideController.acceptRide(
      { params: { id: "ride-id" }, captain: { _id: "captain-id" } },
      response,
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(rideService.confirmRide).not.toHaveBeenCalled();
    expect(pricingService.getCaptainPricing).not.toHaveBeenCalled();
  });
});
