jest.mock("../../services/pricing.service", () => ({
  getCaptainPricing: jest.fn(),
}));
jest.mock("../../services/rideCore.service", () => ({
  normalizeVehicleType: jest.fn((value) => value),
  releaseCaptainBusyIfAvailable: jest.fn(),
}));
jest.mock("../../models/captain.model", () => ({
  findById: jest.fn(),
}));
jest.mock("../../models/rideCore.model", () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findById: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../services/payment.service", () => ({}));
jest.mock("../../services/maps.service", () => ({}));
jest.mock("../../socket", () => ({
  emitToUser: jest.fn(),
  emitToCaptain: jest.fn(),
  emitStandardRidePhase: jest.fn(),
}));
jest.mock("../../socket/rideSocket.events", () => ({
  RIDE_REQUEST: "ride:request",
  RIDE_ACCEPTED: "ride:accepted",
  RIDE_STARTED: "ride:started",
  RIDE_COMPLETED: "ride:completed",
}));
jest.mock("../../utils/serviceArea", () => ({
  isWithinServiceArea: jest.fn(() => true),
  inferServiceCityKeyOrNearest: jest.fn(() => "Kolhapur"),
  ridePickupInServiceArea: jest.fn(() => true),
  logServiceAreaDistances: jest.fn(),
  SERVICE_AREA_ERROR: "Outside service area",
}));

const pricingService = require("../../services/pricing.service");
const captainModel = require("../../models/captain.model");
const rideModel = require("../../models/rideCore.model");
const rideController = require("../../controllers/ride.controller");
const rideService = require("../../services/rideCore.service");

function responseFor() {
  const response = {};
  response.set = jest.fn();
  response.status = jest.fn(() => response);
  response.json = jest.fn((body) => body);
  return response;
}

function captainQuery(captain) {
  return {
    select: jest.fn(() => Promise.resolve(captain)),
  };
}

function rideQuery(rides) {
  const query = {
    populate: jest.fn(() => query),
    sort: jest.fn(() => query),
    limit: jest.fn(() => Promise.resolve(rides)),
  };
  return query;
}

describe("ride offer and first-accept flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pricingService.getCaptainPricing.mockResolvedValue({
      minimumWalletBalance: 50,
    });
  });

  test("returns the same searching ride to two eligible captains", async () => {
    const ride = { _id: "ride-x", status: "searching", city: "Kolhapur" };
    rideModel.find.mockReturnValue(rideQuery([ride]));
    captainModel.findById
      .mockReturnValueOnce(
        captainQuery({
          location: { coordinates: [0, 0] },
          servingCity: "Kolhapur",
          vehicleType: "AUTO",
          subscriptionStatus: "active",
          status: "active",
          blocked: false,
          approved: true,
          isOnline: true,
          walletBalance: 50,
        }),
      )
      .mockReturnValueOnce(
        captainQuery({
          location: { coordinates: [0, 0] },
          servingCity: "Kolhapur",
          vehicleType: "AUTO",
          subscriptionStatus: "active",
          status: "active",
          blocked: false,
          approved: true,
          isOnline: true,
          walletBalance: 60,
        }),
      );

    const firstResponse = responseFor();
    await rideController.getPendingRides(
      { captain: { _id: "captain-a" } },
      firstResponse,
    );
    const secondResponse = responseFor();
    await rideController.getPendingRides(
      { captain: { _id: "captain-b" } },
      secondResponse,
    );

    expect(firstResponse.json).toHaveBeenCalledWith([ride]);
    expect(secondResponse.json).toHaveBeenCalledWith([ride]);
    expect(rideModel.find).toHaveBeenCalledTimes(2);
    expect(rideModel.find.mock.calls[0][0].declinedBy).toEqual({
      $nin: ["captain-a"],
    });
    expect(rideModel.find.mock.calls[1][0].declinedBy).toEqual({
      $nin: ["captain-b"],
    });
  });

  test("does not return pending rides below the configured wallet minimum", async () => {
    captainModel.findById.mockReturnValue(
      captainQuery({
        location: { coordinates: [0, 0] },
        servingCity: "Kolhapur",
        vehicleType: "AUTO",
        subscriptionStatus: "active",
        status: "active",
        blocked: false,
        isOnline: true,
        walletBalance: 49,
      }),
    );

    const result = await rideController.getPendingRides(
      { captain: { _id: "captain-below" } },
      responseFor(),
    );

    expect(result).toEqual([]);
    expect(rideModel.find).not.toHaveBeenCalled();
  });

  test("does not return pending rides to an unapproved captain", async () => {
    captainModel.findById.mockReturnValue(
      captainQuery({
        location: { coordinates: [0, 0] },
        servingCity: "Kolhapur",
        vehicleType: "AUTO",
        subscriptionStatus: "active",
        status: "active",
        blocked: false,
        approved: false,
        isOnline: true,
        walletBalance: 100,
      }),
    );

    const response = responseFor();
    await rideController.getPendingRides(
      { captain: { _id: "captain-unapproved" } },
      response,
    );

    expect(response.json).toHaveBeenCalledWith([]);
    expect(rideModel.find).not.toHaveBeenCalled();
  });

  test("does not return pending rides to a busy captain", async () => {
    captainModel.findById.mockReturnValue(
      captainQuery({
        location: { coordinates: [0, 0] },
        servingCity: "Kolhapur",
        vehicleType: "AUTO",
        subscriptionStatus: "active",
        status: "active",
        blocked: false,
        approved: true,
        isOnline: true,
        walletBalance: 100,
        busy: true,
      }),
    );

    const response = responseFor();
    await rideController.getPendingRides(
      { captain: { _id: "captain-busy" } },
      response,
    );

    expect(response.json).toHaveBeenCalledWith([]);
    expect(rideModel.find).not.toHaveBeenCalled();
  });

  test("excludes the rejecting captain but keeps the ride for another captain", async () => {
    const ride = { _id: "ride-x", status: "searching", city: "Kolhapur" };
    rideModel.find.mockImplementation((filter) =>
      rideQuery(filter.declinedBy.$nin[0] === "captain-a" ? [] : [ride]),
    );
    const eligibleCaptain = {
      location: { coordinates: [0, 0] },
      servingCity: "Kolhapur",
      vehicleType: "AUTO",
      subscriptionStatus: "active",
      status: "active",
      blocked: false,
      approved: true,
      isOnline: true,
      walletBalance: 50,
    };
    captainModel.findById
      .mockReturnValueOnce(captainQuery(eligibleCaptain))
      .mockReturnValueOnce(captainQuery(eligibleCaptain));

    const rejectedResponse = responseFor();
    const otherCaptainResponse = responseFor();
    await rideController.getPendingRides(
      { captain: { _id: "captain-a" } },
      rejectedResponse,
    );
    await rideController.getPendingRides(
      { captain: { _id: "captain-b" } },
      otherCaptainResponse,
    );

    expect(rejectedResponse.json).toHaveBeenCalledWith([]);
    expect(otherCaptainResponse.json).toHaveBeenCalledWith([ride]);
  });

  test("allows a captain to receive a different ride after declining one", async () => {
    const rideB = { _id: "ride-b", status: "searching", city: "Kolhapur" };
    rideModel.find.mockReturnValue(rideQuery([rideB]));
    captainModel.findById.mockReturnValue(
      captainQuery({
        location: { coordinates: [0, 0] },
        servingCity: "Kolhapur",
        vehicleType: "AUTO",
        subscriptionStatus: "active",
        status: "active",
        blocked: false,
        approved: true,
        isOnline: true,
        walletBalance: 100,
      }),
    );

    const response = responseFor();
    await rideController.getPendingRides(
      { captain: { _id: "captain-a" } },
      response,
    );

    expect(response.json).toHaveBeenCalledWith([rideB]);
    expect(rideModel.find.mock.calls[0][0].declinedBy).toEqual({
      $nin: ["captain-a"],
    });
  });

  test.each([
    ["blocked", { blocked: true, approved: true, subscriptionStatus: "active", status: "active", isOnline: true }],
    ["unapproved", { blocked: false, approved: false, subscriptionStatus: "active", status: "active", isOnline: true }],
    ["expired subscription", { blocked: false, approved: true, subscriptionStatus: "expired", status: "active", isOnline: true }],
    ["offline", { blocked: false, approved: true, subscriptionStatus: "active", status: "active", isOnline: false }],
  ])("does not return pending rides to a captain who is %s", (_reason, state) => {
    captainModel.findById.mockReturnValue(
      captainQuery({
        location: { coordinates: [0, 0] },
        servingCity: "Kolhapur",
        vehicleType: "AUTO",
        walletBalance: 100,
        ...state,
      }),
    );

    const response = responseFor();
    return rideController.getPendingRides(
      { captain: { _id: "captain-ineligible" } },
      response,
    ).then(() => {
      expect(response.json).toHaveBeenCalledWith([]);
      expect(rideModel.find).not.toHaveBeenCalled();
    });
  });

  test("regenerates a passenger OTP when the existing expiry has passed", async () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const expiredRide = {
      _id: "64d1d2d0b9f7a1234567890a",
      user: { _id: "user-1" },
      captain: { _id: "captain-1" },
      status: "arrived",
      otpCipher: "invalid-cipher",
      otpExpiresAt: new Date(Date.now() - 60_000),
    };

    rideModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(expiredRide),
      }),
    });
    rideModel.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 });

    await rideController.getPassengerOtp(
      { params: { id: "64d1d2d0b9f7a1234567890a" }, user: { _id: "user-1" } },
      response,
    );

    const payload = response.json.mock.calls[0][0];
    expect(payload.ok).toBe(true);
    expect(payload.otp).toMatch(/^\d{6}$/);
    expect(new Date(payload.expiresAt).getTime()).toBeGreaterThan(Date.now() + 4 * 60 * 1000);
    expect(rideModel.updateOne).toHaveBeenCalledWith(
      { _id: "64d1d2d0b9f7a1234567890a" },
      {
        $set: expect.objectContaining({
          otpExpiresAt: expect.any(Date),
          otpHash: expect.any(String),
          otpCipher: expect.any(String),
        }),
      },
    );
  });

});
