jest.mock("../../models/rideCore.model", () => ({
  findOne: jest.fn(),
  updateOne: jest.fn(),
  findById: jest.fn(),
}));
jest.mock("../../models/captain.model", () => ({
  findById: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../services/maps.service", () => ({}));
jest.mock("../../services/pricing.service", () => ({}));
jest.mock("../../services/payment.service", () => ({
  settleRidePaymentIfNeeded: jest.fn(),
}));
jest.mock("../../utils/otp", () => ({
  expiresInMinutes: jest.fn(),
  randomSixDigit: jest.fn(),
}));
jest.mock("../../utils/otpSecure", () => ({
  encryptOtp: jest.fn(),
  hashOtp: jest.fn(),
  verifyOtp: jest.fn(),
}));

const rideModel = require("../../models/rideCore.model");
const captainModel = require("../../models/captain.model");
const paymentService = require("../../services/payment.service");
const { endRide } = require("../../services/rideCore.service");

function query(value) {
  const result = {
    populate: jest.fn(() => result),
    select: jest.fn(() => result),
    lean: jest.fn(() => Promise.resolve(value)),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return result;
}

describe("ride completion payment settlement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    captainModel.findById.mockReturnValue(query({ busy: true }));
    rideModel.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 });
    captainModel.updateOne.mockResolvedValue({ acknowledged: true });
  });

  test("settles a Cash ride and returns the settled ride", async () => {
    const ride = {
      _id: "ride-id",
      captain: "captain-id",
      status: "started",
      paymentMethod: "Cash",
      startedAt: new Date(Date.now() - 30_000),
    };
    const settledRide = {
      ...ride,
      status: "completed",
      paymentStatus: "success",
      platformFee: 15,
      captainNetEarning: 135,
    };

    rideModel.findById.mockReturnValueOnce(query(ride));
    paymentService.settleRidePaymentIfNeeded.mockResolvedValue(settledRide);

    const result = await endRide({ rideId: ride._id, captain: { _id: ride.captain } });

    expect(rideModel.updateOne).toHaveBeenCalledWith(
      { _id: ride._id, captain: ride.captain, status: "started" },
      expect.objectContaining({ status: "completed" }),
    );
    expect(paymentService.settleRidePaymentIfNeeded).toHaveBeenCalledTimes(1);
    expect(paymentService.settleRidePaymentIfNeeded).toHaveBeenCalledWith(ride._id);
    expect(result).toBe(settledRide);
  });

  test("rejects a stale completion without settlement or busy release", async () => {
    const ride = {
      _id: "ride-stale-completion",
      captain: "captain-id",
      status: "started",
      paymentMethod: "Cash",
      startedAt: new Date(Date.now() - 30_000),
    };
    rideModel.findById.mockReturnValueOnce(query(ride));
    rideModel.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 0 });

    await expect(
      endRide({ rideId: ride._id, captain: { _id: ride.captain } }),
    ).rejects.toMatchObject({ statusCode: 409, message: "Ride not started" });
    expect(paymentService.settleRidePaymentIfNeeded).not.toHaveBeenCalled();
    expect(captainModel.updateOne).not.toHaveBeenCalled();
  });

  test("only one concurrent completion can trigger settlement", async () => {
    const ride = {
      _id: "ride-double-completion",
      captain: "captain-id",
      status: "started",
      paymentMethod: "Cash",
      startedAt: new Date(Date.now() - 30_000),
    };
    rideModel.findById
      .mockReturnValueOnce(query(ride))
      .mockReturnValueOnce(query(ride));
    rideModel.updateOne
      .mockResolvedValueOnce({ acknowledged: true, matchedCount: 1 })
      .mockResolvedValueOnce({ acknowledged: true, matchedCount: 0 });
    paymentService.settleRidePaymentIfNeeded.mockResolvedValue({ status: "completed" });

    const results = await Promise.allSettled([
      endRide({ rideId: ride._id, captain: { _id: ride.captain } }),
      endRide({ rideId: ride._id, captain: { _id: ride.captain } }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(paymentService.settleRidePaymentIfNeeded).toHaveBeenCalledTimes(1);
  });

  test("leaves non-Cash completion on the existing return path", async () => {
    const ride = {
      _id: "ride-id",
      captain: "captain-id",
      status: "started",
      paymentMethod: "Online",
      startedAt: new Date(Date.now() - 30_000),
    };
    const completedRide = { ...ride, status: "completed" };

    rideModel.findById
      .mockReturnValueOnce(query(ride))
      .mockReturnValueOnce(query(completedRide));

    const result = await endRide({ rideId: ride._id, captain: { _id: ride.captain } });

    expect(paymentService.settleRidePaymentIfNeeded).not.toHaveBeenCalled();
    expect(rideModel.findById).toHaveBeenCalledWith(ride._id);
    expect(result).toBe(completedRide);
  });

  test("settles a completed Razorpay ride with the stored payment metadata", async () => {
    const ride = {
      _id: "ride-id",
      captain: "captain-id",
      status: "started",
      paymentMethod: "Razorpay",
      approachPaymentStatus: "paid",
      approachPaymentAmount: 30,
      razorpayOrderId: "order-id",
      razorpayPaymentId: "payment-id",
      razorpaySignature: "signature",
      razorpayPaymentStatus: "captured",
      startedAt: new Date(Date.now() - 30_000),
    };
    const settledRide = {
      ...ride,
      status: "completed",
      paymentStatus: "success",
      remainingFare: 0,
    };
    paymentService.settleRidePaymentIfNeeded.mockResolvedValue(settledRide);
    rideModel.findById.mockReturnValueOnce(query(ride));

    const result = await endRide({ rideId: ride._id, captain: { _id: ride.captain } });

    expect(rideModel.updateOne).toHaveBeenCalledWith(
      { _id: ride._id, captain: ride.captain, status: "started" },
      expect.objectContaining({ status: "completed" }),
    );
    expect(paymentService.settleRidePaymentIfNeeded).toHaveBeenCalledWith(
      ride._id,
      "Razorpay",
      {
        razorpayOrderId: "order-id",
        razorpayPaymentId: "payment-id",
        razorpaySignature: "signature",
        razorpayPaymentStatus: "captured",
      },
    );
    expect(result).toBe(settledRide);
  });

  test("preserves a completed but unsettled Razorpay ride when settlement fails", async () => {
    const ride = {
      _id: "ride-id",
      captain: "captain-id",
      status: "started",
      paymentMethod: "Razorpay",
      approachPaymentStatus: "paid",
      paymentStatus: "partially_paid",
      startedAt: new Date(Date.now() - 30_000),
    };
    const settlementError = new Error("Settlement unavailable");
    rideModel.findById.mockReturnValueOnce(query(ride));
    paymentService.settleRidePaymentIfNeeded.mockRejectedValue(settlementError);

    await expect(
      endRide({ rideId: ride._id, captain: { _id: ride.captain } }),
    ).rejects.toBe(settlementError);
    expect(rideModel.updateOne).toHaveBeenCalledWith(
      { _id: ride._id, captain: ride.captain, status: "started" },
      expect.objectContaining({ status: "completed" }),
    );
    expect(paymentService.settleRidePaymentIfNeeded).toHaveBeenCalledWith(
      ride._id,
      "Razorpay",
      expect.any(Object),
    );
  });

  test("rejects Razorpay completion while a final fare remains unpaid", async () => {
    const ride = {
      _id: "ride-unpaid-final",
      captain: "captain-id",
      status: "started",
      paymentMethod: "Razorpay",
      remainingFare: 76,
      startedAt: new Date(Date.now() - 30_000),
    };
    rideModel.findById.mockReturnValueOnce(query(ride));

    await expect(
      endRide({ rideId: ride._id, captain: { _id: ride.captain } }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Final Razorpay fare payment is required before completing the ride",
    });
    expect(rideModel.updateOne).not.toHaveBeenCalled();
    expect(paymentService.settleRidePaymentIfNeeded).not.toHaveBeenCalled();
    expect(captainModel.updateOne).not.toHaveBeenCalled();
  });

  test("allows Razorpay completion after the remaining fare reaches zero", async () => {
    const ride = {
      _id: "ride-paid-final",
      captain: "captain-id",
      status: "started",
      paymentMethod: "Razorpay",
      remainingFare: 0,
      captainNetEarning: 82,
      startedAt: new Date(Date.now() - 30_000),
    };
    const completedRide = { ...ride, status: "completed" };
    rideModel.findById
      .mockReturnValueOnce(query(ride))
      .mockReturnValueOnce(query(completedRide));

    const result = await endRide({ rideId: ride._id, captain: { _id: ride.captain } });

    expect(result).toBe(completedRide);
    expect(rideModel.updateOne).toHaveBeenCalledTimes(1);
    expect(paymentService.settleRidePaymentIfNeeded).not.toHaveBeenCalled();
  });
});
