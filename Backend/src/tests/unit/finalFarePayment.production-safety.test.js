const mockRazorpay = { orders: { create: jest.fn() }, payments: { fetch: jest.fn() } };

jest.mock("mongoose", () => ({
  isValidObjectId: jest.fn(() => true),
  startSession: jest.fn(() => ({
    withTransaction: async (cb) => cb(),
    endSession: jest.fn(),
  })),
}));
jest.mock("razorpay", () => jest.fn(() => mockRazorpay));
jest.mock("../../models/rideCore.model", () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../models/captain.model", () => ({
  findOneAndUpdate: jest.fn(),
  findById: jest.fn(),
}));
jest.mock("../../models/paymentRecord.model", () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../../models/rideFarePaymentIntent.model", () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  findById: jest.fn(),
}));
jest.mock("../../models/razorpayWebhookEvent.model", () => ({
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../services/pricing.service", () => ({
  getCommissionPercent: jest.fn().mockResolvedValue(15),
  getCaptainPricing: jest.fn(),
}));
jest.mock("../../services/maps.service", () => ({}));
jest.mock("../../utils/logger", () => ({ payment: jest.fn() }));

const crypto = require("crypto");
const mongoose = require("mongoose");
const rideModel = require("../../models/rideCore.model");
const captainModel = require("../../models/captain.model");
const PaymentRecord = require("../../models/paymentRecord.model");
const Intent = require("../../models/rideFarePaymentIntent.model");
const {
  createRideFareRazorpayOrder,
  verifyRideFareRazorpayPayment,
  handleRazorpayRidePaymentWebhook,
} = require("../../services/payment.service");

function query(value) {
  const result = {
    populate: jest.fn(() => result),
    select: jest.fn(() => result),
    session: jest.fn(() => result),
    lean: jest.fn(() => Promise.resolve(value)),
    sort: jest.fn(() => Promise.resolve(value)),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RAZORPAY_KEY_ID = "key";
  process.env.RAZORPAY_KEY_SECRET = "secret";
  PaymentRecord.findOne.mockResolvedValue(null);
  Intent.findOne.mockResolvedValue(null);
  Intent.create.mockResolvedValue({ _id: "intent-1" });
  Intent.findOneAndUpdate.mockResolvedValue({ _id: "intent-1", status: "pending" });
  Intent.updateOne.mockResolvedValue({});
  Intent.findById.mockReturnValue(query(null));
  rideModel.findOneAndUpdate.mockResolvedValue({});
  captainModel.findOneAndUpdate.mockResolvedValue({ _id: "captain-id" });
  PaymentRecord.create.mockResolvedValue([{ _id: "fare-record" }]);
  rideModel.findById.mockReturnValue(query({
    _id: "ride-id",
    user: { _id: "user-id" },
    captain: "captain-id",
    paymentMethod: "Razorpay",
    status: "started",
    approachPaymentStatus: "paid",
    remainingFare: 76,
    price: 96,
    discountAmount: 0,
    approachPaymentAmount: 20,
  }));
  mockRazorpay.orders.create.mockResolvedValue({ id: "order_final", amount: 7600, currency: "INR" });
  mockRazorpay.payments.fetch.mockResolvedValue({
    id: "pay_1",
    order_id: "order_final",
    amount: 7600,
    currency: "INR",
    status: "captured",
    captured: true,
  });
});

test("creates a server-calculated final Razorpay order for a started Razorpay ride", async () => {
  rideModel.findById.mockReturnValue(query({
    _id: "ride-id",
    user: { _id: "user-id" },
    captain: "captain-id",
    paymentMethod: "Razorpay",
    status: "started",
    approachPaymentStatus: "paid",
    price: 96,
    discountAmount: 0,
    approachPaymentAmount: 20,
    remainingFare: 76,
  }));

  const result = await createRideFareRazorpayOrder({ rideId: "ride-id", userId: "user-id" });

  expect(result.orderId).toBe("order_final");
  expect(result.amount).toBe(7600);
  expect(mockRazorpay.orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 7600, currency: "INR" }));
  expect(Intent.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 76, status: "creating" }));
});

test("ignores a client-supplied amount and rejects a settled ride before creating a new final order", async () => {
  rideModel.findById.mockReturnValue(query({
    _id: "ride-id",
    user: { _id: "user-id" },
    captain: "captain-id",
    paymentMethod: "Razorpay",
    status: "started",
    approachPaymentStatus: "paid",
    paymentStatus: "success",
    remainingFare: 0,
    captainNetEarning: 82,
    price: 96,
    discountAmount: 0,
    approachPaymentAmount: 20,
  }));

  await expect(createRideFareRazorpayOrder({ rideId: "ride-id", userId: "user-id", amount: 999, remainingFare: 999, discount: 99 })).rejects.toMatchObject({ statusCode: 409 });
  expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
});

test("rejects a final payment with invalid Razorpay signature", async () => {
  const intent = { _id: "intent-1", rideId: "ride-id", userId: "user-id", razorpayOrderId: "order_final", amount: 76, status: "pending" };
  Intent.findOne.mockResolvedValue(intent);
  rideModel.findOne.mockReturnValue(query({
    _id: "ride-id",
    user: "user-id",
    paymentMethod: "Razorpay",
    status: "started",
    approachPaymentStatus: "paid",
    captainNetEarning: null,
    remainingFare: 76,
    captain: "captain-id",
    price: 96,
    discountAmount: 0,
    approachPaymentAmount: 20,
  }));

  await expect(verifyRideFareRazorpayPayment({
    rideId: "ride-id",
    userId: "user-id",
    razorpay_order_id: "order_final",
    razorpay_payment_id: "pay_1",
    razorpay_signature: "bad-signature",
  })).rejects.toMatchObject({ statusCode: 400, message: "Invalid Razorpay signature" });
});

test("rejects final verification when the Razorpay payment amount does not match remaining fare", async () => {
  const signature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update("order_final|pay_1").digest("hex");
  const intent = { _id: "intent-1", rideId: "ride-id", userId: "user-id", razorpayOrderId: "order_final", amount: 76, status: "pending" };
  Intent.findOne.mockResolvedValue(intent);
  rideModel.findOne.mockReturnValue(query({
    _id: "ride-id",
    user: "user-id",
    paymentMethod: "Razorpay",
    status: "started",
    approachPaymentStatus: "paid",
    captainNetEarning: null,
    remainingFare: 76,
    captain: "captain-id",
    price: 96,
    discountAmount: 0,
    approachPaymentAmount: 20,
  }));
  mockRazorpay.payments.fetch.mockResolvedValue({
    id: "pay_1",
    order_id: "order_final",
    amount: 7500,
    currency: "INR",
    status: "captured",
    captured: true,
  });

  await expect(verifyRideFareRazorpayPayment({
    rideId: "ride-id",
    userId: "user-id",
    razorpay_order_id: "order_final",
    razorpay_payment_id: "pay_1",
    razorpay_signature: signature,
  })).rejects.toMatchObject({ statusCode: 400, message: "Razorpay payment amount does not match the remaining fare" });
});

test("rejects a final verification when the ride is already settled", async () => {
  const intent = { _id: "intent-1", rideId: "ride-id", userId: "user-id", razorpayOrderId: "order_final", amount: 76, status: "pending" };
  Intent.findOne.mockResolvedValue(intent);
  rideModel.findOne.mockReturnValue(query({
    _id: "ride-id",
    user: "user-id",
    paymentMethod: "Razorpay",
    status: "started",
    approachPaymentStatus: "paid",
    captainNetEarning: 82,
    paymentStatus: "success",
    remainingFare: 0,
    captain: "captain-id",
    price: 96,
    discountAmount: 0,
    approachPaymentAmount: 20,
  }));

  await expect(verifyRideFareRazorpayPayment({
    rideId: "ride-id",
    userId: "user-id",
    razorpay_order_id: "order_final",
    razorpay_payment_id: "pay_1",
    razorpay_signature: "ignored",
  })).rejects.toMatchObject({ statusCode: 409, message: "Final fare has already been paid" });
});

function validFinalIntent(overrides = {}) {
  return {
    _id: "intent-1",
    rideId: "ride-id",
    userId: "user-id",
    razorpayOrderId: "order_final",
    amount: 76,
    status: "pending",
    ...overrides,
  };
}

function validFinalRide(overrides = {}) {
  return {
    _id: "ride-id",
    user: "user-id",
    captain: "captain-id",
    paymentMethod: "Razorpay",
    status: "started",
    approachPaymentStatus: "paid",
    captainNetEarning: null,
    remainingFare: 76,
    price: 96,
    discountAmount: 0,
    approachPaymentAmount: 20,
    ...overrides,
  };
}

function configureValidVerification({ intent = validFinalIntent(), ride = validFinalRide(), payment = {} } = {}) {
  const providerPayment = {
    id: "pay_1",
    order_id: "order_final",
    amount: 7600,
    currency: "INR",
    status: "captured",
    captured: true,
    ...payment,
  };
  Intent.findOne.mockImplementation((filter) => (
    filter?.razorpayOrderId ? Promise.resolve(intent) : query(null)
  ));
  Intent.findById.mockReturnValue(query(intent));
  rideModel.findOne
    .mockReturnValueOnce(query(ride))
    .mockReturnValueOnce(query(ride));
  rideModel.findOneAndUpdate.mockResolvedValue({ ...ride, remainingFare: 0, paymentStatus: "success", captainNetEarning: 82 });
  Intent.findOneAndUpdate.mockResolvedValue({ ...intent, status: "success", razorpayPaymentId: "pay_1" });
  PaymentRecord.findOne.mockReturnValue(query(null));
  mockRazorpay.payments.fetch.mockResolvedValue(providerPayment);
  return { intent, ride, providerPayment };
}

function finalVerificationArgs(overrides = {}) {
  return {
    rideId: "ride-id",
    userId: "user-id",
    razorpay_order_id: "order_final",
    razorpay_payment_id: "pay_1",
    razorpay_signature: "ignored-for-test",
    skipSignature: true,
    ...overrides,
  };
}

function serializeTransactions() {
  let tail = Promise.resolve();
  mongoose.startSession.mockImplementation(() => {
    const session = {
      withTransaction: (callback) => {
        const previous = tail;
        let release;
        tail = new Promise((resolve) => { release = resolve; });
        return previous.then(async () => {
          try {
            return await callback();
          } finally {
            release();
          }
        });
      },
      endSession: jest.fn(),
    };
    return session;
  });
}

test("verifies a valid final payment and settles the ride exactly once", async () => {
  configureValidVerification();

  const result = await verifyRideFareRazorpayPayment(finalVerificationArgs());

  expect(result).toEqual(expect.objectContaining({ verified: true, alreadyProcessed: false }));
  expect(PaymentRecord.create).toHaveBeenCalledWith(
    [expect.objectContaining({ amount: 76, paymentType: "ride_fare", paymentMode: "Razorpay", razorpayPaymentId: "pay_1" })],
    { session: expect.anything() },
  );
  expect(rideModel.findOneAndUpdate).toHaveBeenCalledWith(
    { _id: "ride-id", status: "started", captainNetEarning: null },
    { $set: expect.objectContaining({ remainingFare: 0, paymentStatus: "success", platformFee: 14, captainNetEarning: 82 }) },
    expect.objectContaining({ session: expect.anything() }),
  );
  expect(captainModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
});

test.each([
  ["wrong order", { razorpay_order_id: "other-order" }, "Final fare payment intent not found"],
  ["wrong payment", { razorpay_payment_id: "other-payment" }, "Razorpay payment does not belong to this final fare order"],
])("rejects %s during final payment verification", async (_name, args, message) => {
  configureValidVerification();
  if (args.razorpay_order_id) {
    Intent.findOne.mockResolvedValueOnce(null);
    await expect(verifyRideFareRazorpayPayment(finalVerificationArgs(args))).rejects.toMatchObject({ statusCode: 404 });
  } else {
    await expect(verifyRideFareRazorpayPayment(finalVerificationArgs(args))).rejects.toMatchObject({ message });
  }
  expect(PaymentRecord.create).not.toHaveBeenCalled();
});

test.each([
  ["wrong currency", { currency: "USD" }, "Razorpay payment currency must be INR"],
  ["not captured", { status: "created", captured: false }, "Razorpay payment is not captured yet"],
])("rejects %s final payment metadata", async (_name, payment, message) => {
  configureValidVerification({ payment });
  await expect(verifyRideFareRazorpayPayment(finalVerificationArgs())).rejects.toMatchObject({ statusCode: 400, message });
  expect(PaymentRecord.create).not.toHaveBeenCalled();
});

test("rejects a payment already associated with another final-fare intent", async () => {
  const intent = validFinalIntent();
  configureValidVerification({ intent });
  Intent.findOne.mockReset();
  Intent.findOne
    .mockResolvedValueOnce(intent)
    .mockReturnValueOnce(query({ _id: "other-intent", razorpayPaymentId: "pay_1" }));

  await expect(verifyRideFareRazorpayPayment(finalVerificationArgs())).rejects.toMatchObject({
    statusCode: 409,
    message: "Razorpay payment has already been used",
  });
  expect(PaymentRecord.create).not.toHaveBeenCalled();
});

test("a duplicate final verification returns alreadyProcessed without repeating settlement", async () => {
  const intent = validFinalIntent();
  configureValidVerification({ intent });
  const successIntent = validFinalIntent({ status: "success", razorpayPaymentId: "pay_1" });
  Intent.findOne.mockReset();
  Intent.findOne.mockResolvedValueOnce(intent).mockReturnValueOnce(query(null)).mockResolvedValueOnce(successIntent);
  PaymentRecord.findOne.mockResolvedValue({ _id: "fare-record", paymentType: "ride_fare" });

  await verifyRideFareRazorpayPayment(finalVerificationArgs());
  const result = await verifyRideFareRazorpayPayment(finalVerificationArgs());

  expect(result).toEqual(expect.objectContaining({ verified: true, alreadyProcessed: true }));
  expect(PaymentRecord.create).toHaveBeenCalledTimes(1);
  expect(rideModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  expect(captainModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
});

test("final webhook captures the remaining fare through the same settlement path", async () => {
  configureValidVerification();
  Intent.findOne.mockResolvedValueOnce(validFinalIntent());

  const result = await handleRazorpayRidePaymentWebhook("payment.captured", {
    payload: { payment: { entity: { id: "pay_1", order_id: "order_final", amount: 7600, currency: "INR", status: "captured", captured: true, notes: { rideId: "ride-id", userId: "user-id", paymentType: "ride_fare" } } } },
  }, "evt-final");

  expect(result).toEqual(expect.objectContaining({ handled: true, rideId: "ride-id" }));
  expect(PaymentRecord.create).toHaveBeenCalledTimes(1);
  expect(captainModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
});

test("failed final webhook leaves the intent and ride unsettled", async () => {
  const intent = validFinalIntent();
  Intent.findOne.mockResolvedValue(intent);
  Intent.updateOne.mockResolvedValue({ acknowledged: true });

  const result = await handleRazorpayRidePaymentWebhook("payment.failed", {
    payload: { payment: { entity: { id: "pay_failed", order_id: "order_final", error_description: "declined", notes: { rideId: "ride-id", paymentType: "ride_fare" } } } },
  }, "evt-failed");

  expect(result).toEqual(expect.objectContaining({ handled: true }));
  expect(Intent.updateOne).toHaveBeenCalledWith(
    { _id: "intent-1", status: "pending" },
    { $set: { status: "failed", failureReason: "declined" } },
  );
  expect(PaymentRecord.create).not.toHaveBeenCalled();
  expect(rideModel.findOneAndUpdate).not.toHaveBeenCalled();
});

test("two concurrent final verifications settle only once", async () => {
  const intent = validFinalIntent();
  configureValidVerification({ intent });
  serializeTransactions();
  Intent.findOneAndUpdate.mockImplementation(async () => {
    if (intent.status === "success") return null;
    intent.status = "success";
    intent.razorpayPaymentId = "pay_1";
    return intent;
  });
  Intent.findById.mockReturnValue(query(intent));

  const results = await Promise.all([
    verifyRideFareRazorpayPayment(finalVerificationArgs()),
    verifyRideFareRazorpayPayment(finalVerificationArgs()),
  ]);

  expect(results.filter((result) => result.alreadyProcessed)).toHaveLength(1);
  expect(PaymentRecord.create).toHaveBeenCalledTimes(1);
  expect(rideModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  expect(captainModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
});

test("verification and captured webhook concurrently settle only once", async () => {
  const intent = validFinalIntent();
  configureValidVerification({ intent });
  serializeTransactions();
  Intent.findOne.mockImplementation((filter) => (
    filter?.razorpayOrderId ? Promise.resolve(intent) : query(null)
  ));
  Intent.findOneAndUpdate.mockImplementation(async () => {
    if (intent.status === "success") return null;
    intent.status = "success";
    intent.razorpayPaymentId = "pay_1";
    return intent;
  });
  Intent.findById.mockReturnValue(query(intent));

  const [verification, webhook] = await Promise.all([
    verifyRideFareRazorpayPayment(finalVerificationArgs()),
    handleRazorpayRidePaymentWebhook("payment.captured", {
      payload: {
        payment: {
          entity: {
            id: "pay_1",
            order_id: "order_final",
            amount: 7600,
            currency: "INR",
            status: "captured",
            captured: true,
            notes: { rideId: "ride-id", userId: "user-id", paymentType: "ride_fare" },
          },
        },
      },
    }, "evt-race"),
  ]);

  expect(verification.verified).toBe(true);
  expect(webhook.handled).toBe(true);
  expect(PaymentRecord.create).toHaveBeenCalledTimes(1);
  expect(rideModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  expect(captainModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
});
