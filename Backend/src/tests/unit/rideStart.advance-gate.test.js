/**
 * The pre-ride advance gate: a valid OTP alone must not start a trip whose
 * UPI / Online advance has not been verified by the provider.
 *
 * Cash and Wallet rides, plus rides booked before this feature existed, keep
 * their existing behaviour.
 */
jest.mock("../../models/rideCore.model", () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findById: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../models/captain.model", () => ({
  updateOne: jest.fn(),
  findById: jest.fn(),
}));
jest.mock("../../services/maps.service", () => ({}));
jest.mock("../../services/pricing.service", () => ({
  getRates: jest.fn(),
  getCommissionPercent: jest.fn(),
}));
jest.mock("../../services/rating.service", () => ({ recordRating: jest.fn() }));
jest.mock("../../utils/otpSecure", () => ({
  verifyOtp: jest.fn(),
  hashOtp: jest.fn(),
  encryptOtp: jest.fn(),
  decryptOtp: jest.fn(),
}));
jest.mock("../../services/payment.service", () => ({
  settleRidePaymentIfNeeded: jest.fn(),
  ADVANCE_PERCENTAGE: 25,
  roundAmount: (value) => Math.round(Number(value || 0) * 100) / 100,
  computeAdvanceSplit: jest.fn(() => ({ payable: 0, advanceAmount: 0, remainingAmount: 0 })),
  confirmRideAdvancePaid: jest.fn(),
}));

const rideModel = require("../../models/rideCore.model");
const { verifyOtp } = require("../../utils/otpSecure");
const rideService = require("../../services/rideCore.service");

const RIDE_ID = "507f1f77bcf86cd799439011";
const CAPTAIN_ID = "507f1f77bcf86cd799439013";

/** `rideModel.findOne(...).populate().populate().select()` */
function selectable(value) {
  const query = {
    populate: jest.fn(() => query),
    select: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
}

/** `rideModel.findById(...).populate().populate()` */
function populated(value) {
  const query = {
    populate: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
}

function arrivedRide(overrides = {}) {
  return {
    _id: RIDE_ID,
    user: { _id: "507f1f77bcf86cd799439012" },
    captain: { _id: CAPTAIN_ID },
    status: "arrived",
    otpHash: "hashed-otp",
    otpExpiresAt: new Date(Date.now() + 60_000),
    paymentMethod: "UPI",
    paymentStatus: "pending",
    advancePaymentRequired: true,
    advancePaymentStatus: "pending",
    advancePaymentState: "processing",
    ...overrides,
  };
}

const startRide = () =>
  rideService.startRide({ rideId: RIDE_ID, otp: "123456", captain: { _id: CAPTAIN_ID } });

describe("ride start requires a verified advance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyOtp.mockResolvedValue(true);
    rideModel.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 });
    rideModel.findById.mockReturnValue(populated({ _id: RIDE_ID, status: "started" }));
  });

  test("TEST 10: refuses to start a UPI ride while the advance is unpaid", async () => {
    rideModel.findOne.mockReturnValue(selectable(arrivedRide()));

    await expect(startRide()).rejects.toMatchObject({
      statusCode: 402,
      message: "Passenger must complete the 25% advance payment before this ride can start",
    });
    expect(rideModel.updateOne).not.toHaveBeenCalled();
  });

  test("TEST 6/7: a failed or cancelled advance still blocks the trip", async () => {
    rideModel.findOne.mockReturnValue(selectable(arrivedRide({ advancePaymentStatus: "failed" })));

    await expect(startRide()).rejects.toMatchObject({ statusCode: 402 });
    expect(rideModel.updateOne).not.toHaveBeenCalled();
  });

  test("refuses to start while a payment is only in progress", async () => {
    rideModel.findOne.mockReturnValue(
      selectable(arrivedRide({ advancePaymentState: "processing" })),
    );

    await expect(startRide()).rejects.toMatchObject({ statusCode: 402 });
    expect(rideModel.updateOne).not.toHaveBeenCalled();
  });

  test("starts the trip once the advance is verified", async () => {
    rideModel.findOne.mockReturnValue(
      selectable(arrivedRide({ advancePaymentStatus: "success", advancePaymentState: "paid" })),
    );

    await startRide();

    expect(rideModel.updateOne).toHaveBeenCalledWith(
      { _id: RIDE_ID },
      { status: "started", startedAt: expect.any(Date) },
    );
  });

  test("does not gate Cash rides", async () => {
    rideModel.findOne.mockReturnValue(
      selectable(arrivedRide({ paymentMethod: "Cash", advancePaymentRequired: false })),
    );

    await startRide();

    expect(rideModel.updateOne).toHaveBeenCalledWith(
      { _id: RIDE_ID },
      { status: "started", startedAt: expect.any(Date) },
    );
  });

  test("TEST 12: leaves rides booked before the advance existed working", async () => {
    const legacy = arrivedRide();
    delete legacy.advancePaymentRequired;
    delete legacy.advancePaymentStatus;
    rideModel.findOne.mockReturnValue(selectable(legacy));

    await startRide();

    expect(rideModel.updateOne).toHaveBeenCalled();
  });

  test("keeps the OTP check ahead of the payment check", async () => {
    verifyOtp.mockResolvedValue(false);
    rideModel.findOne.mockReturnValue(selectable(arrivedRide()));

    await expect(startRide()).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid OTP",
    });
    expect(rideModel.updateOne).not.toHaveBeenCalled();
  });
});
