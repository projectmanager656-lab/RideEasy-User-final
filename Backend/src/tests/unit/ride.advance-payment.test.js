/**
 * Pre-ride 25% advance payment.
 *
 * `payment.service` is deliberately NOT mocked here: the split maths and
 * `confirmRideAdvancePaid` are the code under test, so only the models, the
 * provider SDK and the side-effect modules around them are faked.
 */
jest.mock("express-validator", () => ({
  validationResult: jest.fn(() => ({ isEmpty: () => true })),
}));
jest.mock("../../models/rideCore.model", () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../models/paymentRecord.model", () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../../models/captain.model", () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../services/rideCore.service", () => ({}));
jest.mock("../../services/pricing.service", () => ({
  getCaptainPricing: jest.fn(),
  getCommissionPercent: jest.fn(),
}));
jest.mock("../../services/maps.service", () => ({}));
jest.mock("../../utils/logger", () => ({ payment: jest.fn() }));
jest.mock("../../socket", () => ({
  emitToUser: jest.fn(),
  emitToCaptain: jest.fn(),
  emitToOnlineDrivers: jest.fn(),
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

/** Provider SDK double — `new Razorpay(...)` returns this instance. */
const mockRazorpay = {
  orders: {
    create: jest.fn(),
    fetch: jest.fn(),
    fetchPayments: jest.fn(),
  },
  payments: { fetch: jest.fn() },
};
jest.mock("razorpay", () => jest.fn(() => mockRazorpay));

const crypto = require("crypto");
const rideModel = require("../../models/rideCore.model");
const PaymentRecord = require("../../models/paymentRecord.model");
const rideController = require("../../controllers/ride.controller");
const paymentService = require("../../services/payment.service");

const RIDE_ID = "507f1f77bcf86cd799439011";
const USER_ID = "507f1f77bcf86cd799439012";
const KEY_ID = "rzp_test_key";
const KEY_SECRET = "rzp_test_secret";

function response() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn((body) => body);
  return res;
}

const bodyOf = (res) => res.json.mock.calls[0][0];

/** `findByIdAndUpdate(...).populate().populate()` */
function populated(value) {
  const query = {
    populate: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
}

function rideDoc(overrides = {}) {
  return {
    _id: RIDE_ID,
    user: USER_ID,
    captain: null,
    price: 400,
    discountAmount: 0,
    paymentMethod: "UPI",
    paymentStatus: "pending",
    advancePaymentRequired: true,
    advancePercentage: 25,
    advanceAmount: 100,
    remainingAmount: 300,
    advancePaymentStatus: "pending",
    advancePaymentState: "processing",
    advancePaymentOrderId: null,
    ...overrides,
  };
}

/** The `$set` the ride was updated with on the nth `findByIdAndUpdate` call. */
const rideSet = (call = 0) => rideModel.findByIdAndUpdate.mock.calls[call][1].$set;

const request = (body = {}, params = {}) => ({
  params: { id: RIDE_ID, ...params },
  user: { _id: USER_ID },
  body,
});

describe("advance split", () => {
  test("is 25% of the payable fare with the remaining 75% left outstanding", () => {
    expect(paymentService.computeAdvanceSplit({ price: 400, discountAmount: 0 })).toEqual({
      payable: 400,
      advanceAmount: 100,
      remainingAmount: 300,
    });
  });

  test("charges on the discounted fare, not the original price", () => {
    expect(paymentService.computeAdvanceSplit({ price: 400, discountAmount: 100 })).toEqual({
      payable: 300,
      advanceAmount: 75,
      remainingAmount: 225,
    });
  });

  test("rounds to paise so the stored amount and the gateway charge agree", () => {
    expect(paymentService.computeAdvanceSplit({ price: 401, discountAmount: 0 })).toEqual({
      payable: 401,
      advanceAmount: 100.25,
      remainingAmount: 300.75,
    });
  });
});

describe("createRideRazorpayOrder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAZORPAY_KEY_ID = KEY_ID;
    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
    rideModel.updateOne.mockResolvedValue({ acknowledged: true });
  });

  test("TEST 1/3: asks the provider for exactly the 25% advance, in INR paise", async () => {
    rideModel.findById.mockResolvedValue(rideDoc());
    mockRazorpay.orders.create.mockResolvedValue({ id: "order_advance" });

    const res = response();
    await rideController.createRideRazorpayOrder(request({ part: "advance" }), res);

    expect(mockRazorpay.orders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10000,
        currency: "INR",
        notes: expect.objectContaining({ rideId: RIDE_ID, paymentType: "ride_fare", part: "advance" }),
      }),
    );
    expect(bodyOf(res).data).toMatchObject({
      orderId: "order_advance",
      amount: 100,
      currency: "INR",
      keyId: KEY_ID,
      part: "advance",
    });
    /* The amount that will be charged is mirrored onto the ride. */
    expect(rideModel.updateOne).toHaveBeenCalledWith(
      { _id: RIDE_ID },
      {
        $set: expect.objectContaining({
          advancePaymentRequired: true,
          advanceAmount: 100,
          remainingAmount: 300,
          advancePaymentOrderId: "order_advance",
          advancePaymentState: "processing",
        }),
      },
    );
  });

  test("TEST 4: opening a checkout never marks the advance paid", async () => {
    rideModel.findById.mockResolvedValue(rideDoc());
    mockRazorpay.orders.create.mockResolvedValue({ id: "order_advance" });

    await rideController.createRideRazorpayOrder(request({ part: "advance" }), response());

    const set = rideModel.updateOne.mock.calls[0][1].$set;
    expect(set.advancePaymentStatus).toBeUndefined();
    expect(set.advancePaymentTransactionId).toBeUndefined();
    expect(set.paymentStatus).toBeUndefined();
    expect(PaymentRecord.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("TEST 9: a second call reuses the open order instead of creating another", async () => {
    rideModel.findById.mockResolvedValue(rideDoc({ advancePaymentOrderId: "order_open" }));
    mockRazorpay.orders.fetch.mockResolvedValue({
      id: "order_open",
      status: "created",
      amount: 10000,
    });

    const res = response();
    await rideController.createRideRazorpayOrder(request({ part: "advance" }), res);

    expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
    expect(bodyOf(res).data).toMatchObject({ orderId: "order_open", reused: true });
  });

  test("does not start a charge once the advance is already verified", async () => {
    rideModel.findById.mockResolvedValue(rideDoc({ advancePaymentStatus: "success" }));

    const res = response();
    await rideController.createRideRazorpayOrder(request({ part: "advance" }), res);

    expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
    expect(mockRazorpay.orders.fetch).not.toHaveBeenCalled();
    expect(bodyOf(res).data).toMatchObject({ alreadyPaid: true });
    /* Nothing was re-recorded, so a repeat tap cannot double-charge. */
    expect(PaymentRecord.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("settles a provider-confirmed payment on the reused order instead of charging again", async () => {
    rideModel.findById.mockResolvedValue(rideDoc({ advancePaymentOrderId: "order_open" }));
    mockRazorpay.orders.fetch.mockResolvedValue({
      id: "order_open",
      status: "paid",
      amount: 10000,
    });
    mockRazorpay.orders.fetchPayments.mockResolvedValue({
      items: [{ id: "pay_captured", status: "captured", amount: 10000 }],
    });
    PaymentRecord.findOneAndUpdate.mockResolvedValue({});
    rideModel.findByIdAndUpdate.mockReturnValue(populated(rideDoc({ advancePaymentStatus: "success" })));

    const res = response();
    await rideController.createRideRazorpayOrder(request({ part: "advance" }), res);

    expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
    expect(PaymentRecord.findOneAndUpdate).toHaveBeenCalledWith(
      { rideId: RIDE_ID, paymentType: "ride_fare", paymentPart: "advance" },
      expect.anything(),
      { upsert: true, new: true },
    );
    expect(rideSet()).toEqual(
      expect.objectContaining({
        advancePaymentStatus: "success",
        advancePaymentState: "paid",
        advancePaymentTransactionId: "pay_captured",
      }),
    );
    expect(bodyOf(res).data).toMatchObject({ alreadyPaid: true });
  });

  test("TEST 9b: a provider failure never fabricates a usable order id", async () => {
    rideModel.findById.mockResolvedValue(rideDoc());
    mockRazorpay.orders.create.mockRejectedValue(new Error("bad credentials"));

    const res = response();
    await rideController.createRideRazorpayOrder(request({ part: "advance" }), res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(bodyOf(res).orderId).toBeUndefined();
    expect(bodyOf(res).data).toBeUndefined();
    expect(rideModel.updateOne).not.toHaveBeenCalled();
  });

  test("refuses to start a payment when the gateway is not configured", async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    rideModel.findById.mockResolvedValue(rideDoc());

    const res = response();
    await rideController.createRideRazorpayOrder(request({ part: "advance" }), res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
  });

  test("rejects another passenger without creating a provider order", async () => {
    rideModel.findById.mockResolvedValue(rideDoc());

    const res = response();
    await rideController.createRideRazorpayOrder(
      { params: { id: RIDE_ID }, user: { _id: "507f1f77bcf86cd799439099" }, body: { part: "advance" } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
  });
});

describe("payMock advance guard", () => {
  /**
   * The ambient shell can set NODE_ENV=production (jest only defaults it to
   * `test` when unset), which would trip the endpoint's own production guard.
   */
  const ambientNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = "test";
    delete process.env.ALLOW_MOCK_PAYMENTS;
  });

  afterAll(() => {
    process.env.NODE_ENV = ambientNodeEnv;
  });

  test("an unverified recorder cannot mark a provider-required advance as paid", async () => {
    rideModel.findById.mockResolvedValue(rideDoc({ advancePaymentRequired: true }));

    const res = response();
    await rideController.payMock(request({ rideId: RIDE_ID, method: "UPI", part: "advance" }), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(PaymentRecord.create).not.toHaveBeenCalled();
    expect(rideModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test("still records a Cash advance, and only the 25%", async () => {
    rideModel.findById.mockResolvedValue(
      rideDoc({ paymentMethod: "Cash", advancePaymentRequired: false }),
    );
    PaymentRecord.create.mockResolvedValue({ externalRef: "txn_cash" });
    rideModel.findByIdAndUpdate.mockReturnValue(
      populated(rideDoc({ paymentMethod: "Cash", advancePaymentStatus: "success" })),
    );

    const res = response();
    await rideController.payMock(request({ rideId: RIDE_ID, method: "Cash", part: "advance" }), res);

    expect(rideSet()).toEqual(
      expect.objectContaining({
        advanceAmount: 100,
        advancePaymentStatus: "success",
        remainingAmount: 300,
      }),
    );
    /* The full fare must stay outstanding for the completion screen to collect. */
    expect(rideSet().paymentStatus).toBeUndefined();
    expect(rideSet().chargedAmount).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("verifyRideRazorpayPayment", () => {
  const signatureFor = (orderId, paymentId) =>
    crypto.createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

  const capturedPayment = (overrides = {}) => ({
    id: "pay_1",
    amount: 10000,
    currency: "INR",
    status: "captured",
    order_id: "order_advance",
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAZORPAY_KEY_ID = KEY_ID;
    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
    PaymentRecord.findOneAndUpdate.mockResolvedValue({});
  });

  test("TEST 5/11: marks only the advance paid, leaving the remaining 75% outstanding", async () => {
    rideModel.findById.mockResolvedValue(rideDoc({ advancePaymentOrderId: "order_advance" }));
    mockRazorpay.payments.fetch.mockResolvedValue(capturedPayment());
    rideModel.findByIdAndUpdate.mockReturnValue(
      populated(rideDoc({ advancePaymentStatus: "success", advancePaymentState: "paid" })),
    );

    const res = response();
    await rideController.verifyRideRazorpayPayment(
      request({
        razorpayOrderId: "order_advance",
        razorpayPaymentId: "pay_1",
        razorpaySignature: signatureFor("order_advance", "pay_1"),
        part: "advance",
      }),
      res,
    );

    expect(rideSet()).toEqual(
      expect.objectContaining({
        advanceAmount: 100,
        advancePaymentStatus: "success",
        advancePaymentState: "paid",
        advancePaymentTransactionId: "pay_1",
        remainingAmount: 300,
      }),
    );
    /* The whole fare must NOT be settled by an advance. */
    expect(rideSet().paymentStatus).toBeUndefined();
    expect(rideSet().chargedAmount).toBeUndefined();
    expect(bodyOf(res).data.advancePaymentStatus).toBe("success");
  });

  test("TEST 3: rejects a tampered signature without touching the ride", async () => {
    rideModel.findById.mockResolvedValue(rideDoc({ advancePaymentOrderId: "order_advance" }));

    const res = response();
    await rideController.verifyRideRazorpayPayment(
      request({
        razorpayOrderId: "order_advance",
        razorpayPaymentId: "pay_1",
        razorpaySignature: "0".repeat(64),
        part: "advance",
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockRazorpay.payments.fetch).not.toHaveBeenCalled();
    expect(rideModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(PaymentRecord.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("rejects a payment whose amount does not match the ride's advance", async () => {
    rideModel.findById.mockResolvedValue(rideDoc({ advancePaymentOrderId: "order_advance" }));
    /* ₹50 captured for a ₹100 advance. */
    mockRazorpay.payments.fetch.mockResolvedValue(capturedPayment({ amount: 5000 }));

    const res = response();
    await rideController.verifyRideRazorpayPayment(
      request({
        razorpayOrderId: "order_advance",
        razorpayPaymentId: "pay_1",
        razorpaySignature: signatureFor("order_advance", "pay_1"),
        part: "advance",
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(rideModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test("rejects a payment that belongs to a different order", async () => {
    rideModel.findById.mockResolvedValue(rideDoc({ advancePaymentOrderId: "order_advance" }));
    mockRazorpay.payments.fetch.mockResolvedValue(capturedPayment({ order_id: "order_someone_else" }));

    const res = response();
    await rideController.verifyRideRazorpayPayment(
      request({
        razorpayOrderId: "order_someone_else",
        razorpayPaymentId: "pay_1",
        razorpaySignature: signatureFor("order_someone_else", "pay_1"),
        part: "advance",
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(rideModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test("TEST 6: an unsuccessful payment stays unpaid and is retryable", async () => {
    rideModel.findById.mockResolvedValue(rideDoc({ advancePaymentOrderId: "order_advance" }));
    mockRazorpay.payments.fetch.mockResolvedValue(capturedPayment({ status: "failed" }));

    const res = response();
    await rideController.verifyRideRazorpayPayment(
      request({
        razorpayOrderId: "order_advance",
        razorpayPaymentId: "pay_1",
        razorpaySignature: signatureFor("order_advance", "pay_1"),
        part: "advance",
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(rideModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(rideModel.updateOne).toHaveBeenCalledWith(
      { _id: RIDE_ID, advancePaymentStatus: { $ne: "success" } },
      { $set: { advancePaymentStatus: "failed", advancePaymentState: "failed" } },
    );
  });

  test("TEST 9c: a repeated confirmation is idempotent", async () => {
    rideModel.findById.mockResolvedValue(
      rideDoc({ advancePaymentStatus: "success", advancePaymentTransactionId: "pay_1" }),
    );

    const res = response();
    await rideController.verifyRideRazorpayPayment(
      request({
        razorpayOrderId: "order_advance",
        razorpayPaymentId: "pay_1",
        razorpaySignature: signatureFor("order_advance", "pay_1"),
        part: "advance",
      }),
      res,
    );

    expect(bodyOf(res).data).toMatchObject({ alreadyPaid: true });
    expect(mockRazorpay.payments.fetch).not.toHaveBeenCalled();
    expect(rideModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(PaymentRecord.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("TEST 7: a cancelled attempt leaves the ride unpaid", async () => {
    rideModel.findById.mockResolvedValue(rideDoc({ advancePaymentOrderId: "order_advance" }));

    const res = response();
    await rideController.verifyRideRazorpayPayment(
      request({
        razorpayOrderId: "order_advance",
        razorpayPaymentId: "pay_1",
        razorpaySignature: "",
        part: "advance",
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(rideModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(rideModel.updateOne).not.toHaveBeenCalled();
  });

  test("keeps the advance ledger on the single (ride_fare, advance) row", async () => {
    rideModel.findById.mockResolvedValue(rideDoc({ advancePaymentOrderId: "order_advance" }));
    mockRazorpay.payments.fetch.mockResolvedValue(capturedPayment());
    rideModel.findByIdAndUpdate.mockReturnValue(populated(rideDoc({ advancePaymentStatus: "success" })));

    await rideController.verifyRideRazorpayPayment(
      request({
        razorpayOrderId: "order_advance",
        razorpayPaymentId: "pay_1",
        razorpaySignature: signatureFor("order_advance", "pay_1"),
        part: "advance",
      }),
      response(),
    );

    expect(PaymentRecord.findOneAndUpdate).toHaveBeenCalledWith(
      { rideId: RIDE_ID, paymentType: "ride_fare", paymentPart: "advance" },
      { $set: expect.objectContaining({ amount: 100, externalRef: "pay_1", paymentPart: "advance" }) },
      { upsert: true, new: true },
    );
  });
});
