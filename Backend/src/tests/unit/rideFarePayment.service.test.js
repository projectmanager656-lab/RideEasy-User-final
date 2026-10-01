const mockRazorpay = { orders: { create: jest.fn() }, payments: { fetch: jest.fn() } };

jest.mock("mongoose", () => ({ isValidObjectId: jest.fn(() => true), startSession: jest.fn() }));
jest.mock("razorpay", () => jest.fn(() => mockRazorpay));
jest.mock("../../models/rideCore.model", () => ({ findById: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() }));
jest.mock("../../models/captain.model", () => ({ findById: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock("../../models/paymentRecord.model", () => ({ findOne: jest.fn(), create: jest.fn() }));
jest.mock("../../models/rideFarePaymentIntent.model", () => ({ findOne: jest.fn(), create: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() }));
jest.mock("../../models/razorpayWebhookEvent.model", () => ({}));
jest.mock("../../services/pricing.service", () => ({ getCommissionPercent: jest.fn(), getCaptainPricing: jest.fn() }));
jest.mock("../../services/maps.service", () => ({}));
jest.mock("../../utils/logger", () => ({ payment: jest.fn() }));

const mongoose = require("mongoose");
const rideModel = require("../../models/rideCore.model");
const PaymentRecord = require("../../models/paymentRecord.model");
const Intent = require("../../models/rideFarePaymentIntent.model");
const { createRideFareRazorpayOrder } = require("../../services/payment.service");

const rideId = "ride-id";
const userId = "user-id";
function chain(value) { return { populate: jest.fn(() => Promise.resolve(value)) }; }
function ride(overrides = {}) { return { _id: rideId, user: { _id: userId }, captain: "captain-id", status: "started", paymentMethod: "Razorpay", approachPaymentStatus: "paid", price: 100, discountAmount: 4, approachPaymentAmount: 20, ...overrides }; }
function emptyQuery() { return { sort: jest.fn(() => Promise.resolve(null)) }; }

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RAZORPAY_KEY_ID = "key"; process.env.RAZORPAY_KEY_SECRET = "secret";
  rideModel.findById.mockImplementation(() => chain(ride()));
  PaymentRecord.findOne.mockResolvedValue(null);
  Intent.findOne.mockImplementation(() => emptyQuery());
  Intent.create.mockResolvedValue({ _id: "intent-1" });
  Intent.findOneAndUpdate.mockResolvedValue({ _id: "intent-1", status: "pending" });
  Intent.updateOne.mockResolvedValue({});
  mockRazorpay.orders.create.mockResolvedValue({ id: "order_final", amount: 7600, currency: "INR" });
});

test("creates an INR order for only the server-calculated ₹76 remainder", async () => {
  const result = await createRideFareRazorpayOrder({ rideId, userId, amount: 1, remainingFare: 1, discount: 0 });
  expect(mockRazorpay.orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 7600, currency: "INR" }));
  expect(Intent.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 76, status: "creating" }));
  expect(result.orderId).toBe("order_final");
});

test.each([
  ["another passenger", ride({ user: { _id: "other" } }), 403],
  ["cash ride", ride({ paymentMethod: "Cash" }), 400],
  ["unpaid approach", ride({ approachPaymentStatus: "pending" }), 409],
  ["zero remainder", ride({ approachPaymentAmount: 96 }), 409],
])("rejects %s without creating a provider order", async (_name, current, statusCode) => {
  rideModel.findById.mockImplementation(() => chain(current));
  await expect(createRideFareRazorpayOrder({ rideId, userId })).rejects.toMatchObject({ statusCode });
  expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
});

test("reuses a pending final order", async () => {
  Intent.findOne.mockImplementation(() => ({ sort: jest.fn(() => Promise.resolve({ razorpayOrderId: "order_existing", amount: 76 })) }));
  const result = await createRideFareRazorpayOrder({ rideId, userId });
  expect(result.orderId).toBe("order_existing");
  expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
});

test("does not make a second provider order while another request owns the reservation", async () => {
  Intent.findOne
    .mockImplementationOnce(() => emptyQuery())
    .mockImplementationOnce(() => ({ sort: jest.fn(() => Promise.resolve({ _id: "creating", status: "creating" })) }));
  await expect(createRideFareRazorpayOrder({ rideId, userId })).rejects.toMatchObject({ statusCode: 409 });
  expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
});
