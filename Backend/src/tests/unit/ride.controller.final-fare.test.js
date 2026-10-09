jest.mock("express-validator", () => ({
  validationResult: jest.fn(() => ({ isEmpty: () => true })),
}));
jest.mock("../../models/rideCore.model", () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
}));
jest.mock("../../services/rideCore.service", () => ({}));
jest.mock("../../services/payment.service", () => ({
  settleRidePaymentIfNeeded: jest.fn(),
}));
jest.mock("../../services/pricing.service", () => ({
  getCaptainPricing: jest.fn(),
}));
jest.mock("../../services/maps.service", () => ({}));
jest.mock("../../models/captain.model", () => ({}));
jest.mock("../../utils/otpSecure", () => ({}));
jest.mock("../../utils/otp", () => ({}));
jest.mock("../../utils/apiResponse", () => ({ fail: jest.fn(), ok: jest.fn() }));
jest.mock("../../utils/serviceArea", () => ({}));
jest.mock("../../socket", () => ({
  emitToUser: jest.fn(),
  emitToCaptain: jest.fn(),
  emitStandardRidePhase: jest.fn(),
}));
jest.mock("../../socket/rideSocket.events", () => ({}));

const rideModel = require("../../models/rideCore.model");
const paymentService = require("../../services/payment.service");
const { confirmPassengerPaidCaptain } = require("../../controllers/ride.controller");

function response() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe("cash confirmation separation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("rejects cash confirmation for a completed Razorpay ride", async () => {
    rideModel.findOne.mockResolvedValue({
      _id: "ride-id",
      captain: "captain-id",
      status: "completed",
      paymentMethod: "Razorpay",
      paymentStatus: "partially_paid",
    });
    const res = response();

    await confirmPassengerPaidCaptain(
      { body: { rideId: "ride-id" }, captain: { _id: "captain-id" } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: "Razorpay rides must be settled through final Razorpay payment",
    });
    expect(paymentService.settleRidePaymentIfNeeded).not.toHaveBeenCalled();
  });

  test("keeps Cash confirmation on the existing settlement path", async () => {
    const ride = {
      _id: "ride-id",
      captain: { _id: "captain-id" },
      user: { _id: "user-id" },
      status: "completed",
      paymentMethod: "Cash",
      paymentStatus: "pending",
    };
    const settled = { ...ride, paymentStatus: "success" };
    rideModel.findOne.mockResolvedValue(ride);
    paymentService.settleRidePaymentIfNeeded.mockResolvedValue(settled);

    const res = response();
    await confirmPassengerPaidCaptain(
      { body: { rideId: "ride-id" }, captain: { _id: "captain-id" } },
      res,
    );

    expect(paymentService.settleRidePaymentIfNeeded).toHaveBeenCalledWith("ride-id");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
