jest.mock("../../models/admin.model", () => ({}));
jest.mock("../../models/user.model", () => ({}));
jest.mock("../../models/captain.model", () => ({
  findById: jest.fn(),
}));
jest.mock("../../models/paymentRecord.model", () => ({}));
jest.mock("../../models/captainOnboarding.model", () => ({}));
jest.mock("../../models/rideCore.model", () => ({
  findById: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../services/pricing.service", () => ({
  getCaptainPricing: jest.fn(),
}));
jest.mock("../../services/rideCore.service", () => ({
  releaseCaptainBusyIfAvailable: jest.fn(),
}));
jest.mock("../../utils/serviceArea", () => ({}));
jest.mock("../../socket", () => ({
  emitToUser: jest.fn(),
  emitToCaptain: jest.fn(),
  emitStandardRidePhase: jest.fn(),
}));
jest.mock("../../socket/rideSocket.events", () => ({
  RIDE_COMPLETED: "ride:completed",
}));

const rideModel = require("../../models/rideCore.model");
const rideService = require("../../services/rideCore.service");
const rideController = require("../../controllers/ride.controller");

function responseFor() {
  const response = {};
  response.status = jest.fn(() => response);
  response.json = jest.fn(() => response);
  return response;
}

function rideQuery(ride) {
  const query = {
    populate: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(ride).then(resolve, reject),
  };
  return query;
}

function ownedRide(status, captain = "captain-a") {
  return {
    _id: "ride-id",
    status,
    user: { _id: "user-a" },
    captain: captain ? { _id: captain } : null,
    price: 100,
    pickupLocation: "Pickup",
    dropLocation: "Drop",
    vehicleType: "AUTO",
    city: "Kolhapur",
  };
}

describe("ride cancellation status races", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rideService.releaseCaptainBusyIfAvailable.mockResolvedValue(undefined);
  });

  test.each(["searching", "accepted", "arrived"])(
    "passenger cancellation uses a conditional %s predicate",
    async (status) => {
      rideModel.findById.mockReturnValueOnce(rideQuery(ownedRide(status)));
      rideModel.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 });
      const response = responseFor();

      await rideController.cancelRideByUser(
        { params: { id: "ride-id" }, user: { _id: "user-a" }, body: {} },
        response,
      );

      expect(rideModel.updateOne).toHaveBeenCalledWith(
        { _id: "ride-id", status: { $in: ["searching", "accepted", "arrived"] } },
        expect.objectContaining({ $set: expect.objectContaining({ status: "cancelled" }) }),
      );
      expect(rideService.releaseCaptainBusyIfAvailable).toHaveBeenCalled();
    },
  );

  test("passenger cancellation reports a race loss without releasing busy or emitting success", async () => {
    rideModel.findById.mockReturnValueOnce(rideQuery(ownedRide("accepted")));
    rideModel.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 0 });
    const response = responseFor();

    await rideController.cancelRideByUser(
      { params: { id: "ride-id" }, user: { _id: "user-a" }, body: {} },
      response,
    );

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        ok: false,
        message: "Ride cannot be cancelled at this stage",
      }),
    );
    expect(rideService.releaseCaptainBusyIfAvailable).not.toHaveBeenCalled();
  });

  test.each(["accepted", "arrived"])(
    "captain cancellation uses a conditional %s predicate",
    async (status) => {
      rideModel.findById.mockReturnValueOnce(rideQuery(ownedRide(status)));
      rideModel.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 });
      const response = responseFor();

      await rideController.cancelRideByCaptain(
        { params: { id: "ride-id" }, captain: { _id: "captain-a" }, body: {} },
        response,
      );

      expect(rideModel.updateOne).toHaveBeenCalledWith(
        { _id: "ride-id", status: { $in: ["accepted", "arrived"] } },
        expect.objectContaining({ $set: expect.objectContaining({ status: "cancelled" }) }),
      );
      expect(rideService.releaseCaptainBusyIfAvailable).toHaveBeenCalled();
    },
  );

  test("captain cancellation reports a race loss without applying a penalty", async () => {
    rideModel.findById.mockReturnValueOnce(rideQuery(ownedRide("arrived")));
    rideModel.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 0 });
    const response = responseFor();

    await rideController.cancelRideByCaptain(
      { params: { id: "ride-id" }, captain: { _id: "captain-a" }, body: {} },
      response,
    );

    expect(response.status).toHaveBeenCalledWith(409);
    expect(rideService.releaseCaptainBusyIfAvailable).not.toHaveBeenCalled();
  });
});