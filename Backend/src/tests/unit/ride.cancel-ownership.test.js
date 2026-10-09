/**
 * Ownership guard: a cancel can only ever act on the authenticated owner's ride.
 * User B must never be able to cancel User A's ride, and a captain must never be able
 * to cancel another captain's ride — no DB writes, no coupon/captain side effects.
 */
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
const socket = require("../../socket");
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

describe("ride cancellation ownership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("User B cannot cancel User A's ride (403, no write, no events)", async () => {
    rideModel.findById.mockReturnValueOnce(
      rideQuery({
        _id: "ride-a",
        status: "searching",
        user: { _id: "user-a" },
        captain: null,
      }),
    );
    const response = responseFor();

    await rideController.cancelRideByUser(
      { params: { id: "ride-a" }, user: { _id: "user-b" }, body: {} },
      response,
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, ok: false, message: "Forbidden" }),
    );
    expect(rideModel.updateOne).not.toHaveBeenCalled();
    expect(rideService.releaseCaptainBusyIfAvailable).not.toHaveBeenCalled();
    expect(socket.emitToUser).not.toHaveBeenCalled();
    expect(socket.emitToCaptain).not.toHaveBeenCalled();
  });

  test("a captain cannot cancel another captain's ride (403, no write)", async () => {
    rideModel.findById.mockReturnValueOnce(
      rideQuery({
        _id: "ride-a",
        status: "accepted",
        user: { _id: "user-a" },
        captain: { _id: "captain-a" },
      }),
    );
    const response = responseFor();

    await rideController.cancelRideByCaptain(
      { params: { id: "ride-a" }, captain: { _id: "captain-b" }, body: {} },
      response,
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(rideModel.updateOne).not.toHaveBeenCalled();
    expect(rideService.releaseCaptainBusyIfAvailable).not.toHaveBeenCalled();
    expect(socket.emitToUser).not.toHaveBeenCalled();
    expect(socket.emitToCaptain).not.toHaveBeenCalled();
  });
});
