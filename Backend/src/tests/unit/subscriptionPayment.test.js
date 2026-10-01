const crypto = require('crypto');

const mockRazorpay = {
  orders: { create: jest.fn() },
  payments: { fetch: jest.fn() },
};

jest.mock('razorpay', () => jest.fn(() => mockRazorpay));
jest.mock('mongoose', () => ({
  startSession: jest.fn(),
}));
jest.mock('../../models/captain.model', () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../../models/captainOnboarding.model', () => ({
  findOne: jest.fn(),
}));
jest.mock('../../models/subscriptionRecord.model', () => ({
  create: jest.fn(),
}));
jest.mock('../../models/paymentRecord.model', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
}));
jest.mock('../../models/subscriptionPaymentIntent.model', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../../services/pricing.service', () => ({
  getDriverPlansMerged: jest.fn(),
}));
jest.mock('../../services/registrationPayment.service', () => ({
  hasPaidRegistrationFee: jest.fn(),
}));

const mongoose = require('mongoose');
const Captain = require('../../models/captain.model');
const CaptainOnboarding = require('../../models/captainOnboarding.model');
const SubscriptionRecord = require('../../models/subscriptionRecord.model');
const PaymentRecord = require('../../models/paymentRecord.model');
const Intent = require('../../models/subscriptionPaymentIntent.model');
const pricingService = require('../../services/pricing.service');
const registrationPayment = require('../../services/registrationPayment.service');
const {
  createSubscriptionPayment,
  verifySubscriptionPayment,
  failSubscriptionPayment,
  handleRazorpayWebhook,
} = require('../../services/subscriptionPayment.service');

const captainId = '507f1f77bcf86cd799439011';
const otherCaptainId = '507f1f77bcf86cd799439012';
const intentId = '507f1f77bcf86cd799439013';
const orderId = 'order_subscription_1';
const paymentId = 'pay_subscription_1';
const secret = 'subscription-test-secret';

const onboarding = {
  onboardingStatus: 'approved',
  personalInformation: {
    legalFullName: 'Test Captain', dateOfBirth: '1990-01-01', mobileNumber: '9999999999',
    gender: 'other', residentialAddress: 'Test Address', servingCity: 'Kolhapur', profilePhoto: 'profile.jpg',
  },
  identityVerification: {
    identityDocumentType: 'aadhaar', identityDocumentNumber: 'TEST-ID-1', nameAsPerIdentityDocument: 'Test Captain',
    dateOfBirthAsPerIdentityDocument: '1990-01-01', identityDocumentFront: 'id-front.jpg', identityDocumentBack: 'id-back.jpg',
  },
  drivingLicence: {
    drivingLicenceNumber: 'LIC12345', nameAsPerDrivingLicence: 'Test Captain', dateOfBirthAsPerDrivingLicence: '1990-01-01',
    licenceClass: 'transport', licenceIssueDate: '2020-01-01', licenceExpiryDate: '2030-01-01',
    drivingLicenceFront: 'licence-front.jpg', drivingLicenceBack: 'licence-back.jpg',
  },
  vehicleInformation: {
    vehicleRegistrationNumber: 'MH12AB1234', vehicleType: 'AUTO', vehicleManufacturer: 'Test', vehicleModel: 'Model',
    manufacturingYear: 2023, fuelType: 'CNG', seatingCapacity: 3, vehicleOwnershipType: 'owned', rcNumber: 'RC12345',
    nameAsPerRC: 'Test Captain', rcDocumentFront: 'rc-front.jpg', rcDocumentBack: 'rc-back.jpg',
  },
  insurance: {
    insurancePolicyNumber: 'INS12345', policyHolderName: 'Test Captain', insuranceExpiryDate: '2030-01-01', insuranceCertificate: 'insurance.jpg',
  },
};

function signature(order = orderId, payment = paymentId) {
  return crypto.createHmac('sha256', secret).update(`${order}|${payment}`).digest('hex');
}

function chain(value) {
  return {
    sort: jest.fn(() => Promise.resolve(value)),
    session: jest.fn(() => Promise.resolve(value)),
    lean: jest.fn(() => Promise.resolve(value)),
  };
}

function intentQuery(value) {
  return Object.assign(value || {}, {
    sort: jest.fn(() => Promise.resolve(value)),
    session: jest.fn(() => Promise.resolve(value)),
  });
}

function intent(overrides = {}) {
  return {
    _id: intentId,
    captainId,
    planType: 'monthly',
    vehicleType: 'AUTO',
    subscriptionAmount: 149,
    initialWalletAmount: 500,
    totalAmount: 649,
    currency: 'INR',
    razorpayOrderId: orderId,
    razorpayPaymentId: null,
    status: 'pending',
    ...overrides,
  };
}

function configureCaptain(captain = {}) {
  const doc = { _id: captainId, approved: true, blocked: false, ...captain };
  Captain.findById.mockReturnValue({
    lean: jest.fn().mockResolvedValue(doc),
    session: jest.fn().mockResolvedValue(doc),
  });
}

function configureIntent(intentDoc = intent()) {
  Intent.findOne.mockImplementation((query) => {
    if (query.status === 'pending' && query.captainId === captainId) return chain(intentDoc.status === 'pending' ? intentDoc : null);
    if (query.status === 'success') return intentQuery(intentDoc.status === 'success' ? intentDoc : null);
    if (query._id === intentId && query.captainId === captainId) return intentQuery(intentDoc);
    if (query.razorpayOrderId === orderId) return intentQuery(intentDoc);
    return chain(null);
  });
  Intent.findOneAndUpdate.mockResolvedValue({ ...intentDoc, status: 'success', razorpayPaymentId: paymentId });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RAZORPAY_KEY_ID = 'test-key';
  process.env.RAZORPAY_KEY_SECRET = secret;
  configureCaptain();
  CaptainOnboarding.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(onboarding) });
  registrationPayment.hasPaidRegistrationFee.mockResolvedValue(true);
  pricingService.getDriverPlansMerged.mockResolvedValue({ AUTO: { weekly: 39, monthly: 149, yearly: 1199 } });
  Intent.findOne.mockReturnValue(chain(null));
  Intent.create.mockResolvedValue(intent());
  mockRazorpay.orders.create.mockResolvedValue({ id: orderId, amount: 64900, currency: 'INR' });
  mockRazorpay.payments.fetch.mockResolvedValue({ id: paymentId, order_id: orderId, amount: 64900, currency: 'INR', captured: true, method: 'upi' });
  mongoose.startSession.mockResolvedValue({
    withTransaction: jest.fn(async (callback) => callback()),
    endSession: jest.fn(),
  });
  PaymentRecord.create.mockResolvedValue([{ _id: 'payment-record-1' }]);
  SubscriptionRecord.create.mockResolvedValue([{ _id: 'subscription-record-1' }]);
  Captain.findOneAndUpdate.mockResolvedValue({ _id: captainId, walletBalance: 500, subscriptionStatus: 'active' });
  Intent.findOneAndUpdate.mockResolvedValue({ ...intent(), status: 'success', razorpayPaymentId: paymentId });
});

test('rejects registration-unpaid captain', async () => {
  registrationPayment.hasPaidRegistrationFee.mockResolvedValue(false);
  await expect(createSubscriptionPayment({ captainId, plan: 'monthly', initialWalletAmount: 0 })).rejects.toMatchObject({ statusCode: 403 });
  expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
});

test.each([
  ['unapproved', { approved: false }, 403],
  ['blocked', { blocked: true }, 403],
  ['incomplete onboarding', {}, 400],
])('rejects %s captain/state', async (_name, captain, status) => {
  configureCaptain(captain);
  if (_name === 'incomplete onboarding') CaptainOnboarding.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ ...onboarding, insurance: {} }) });
  await expect(createSubscriptionPayment({ captainId, plan: 'monthly', initialWalletAmount: 0 })).rejects.toMatchObject({ statusCode: status });
});

test.each([
  ['invalid plan', { plan: 'invalid', initialWalletAmount: 0 }],
  ['negative wallet', { plan: 'monthly', initialWalletAmount: -1 }],
  ['NaN wallet', { plan: 'monthly', initialWalletAmount: NaN }],
  ['Infinity wallet', { plan: 'monthly', initialWalletAmount: Infinity }],
  ['string wallet', { plan: 'monthly', initialWalletAmount: '500' }],
])('rejects %s', async (_name, input) => {
  await expect(createSubscriptionPayment({ captainId, ...input })).rejects.toBeInstanceOf(Error);
  expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
});

test('uses server pricing and creates exactly one INR order', async () => {
  await createSubscriptionPayment({ captainId, plan: 'monthly', initialWalletAmount: 500 });
  expect(mockRazorpay.orders.create).toHaveBeenCalledTimes(1);
  expect(mockRazorpay.orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 64900, currency: 'INR' }));
  expect(Intent.create).toHaveBeenCalledWith(expect.objectContaining({ subscriptionAmount: 149, initialWalletAmount: 500, totalAmount: 649, currency: 'INR' }));
});

test('accepts zero initial wallet and does not activate before verification', async () => {
  await createSubscriptionPayment({ captainId, plan: 'monthly', initialWalletAmount: 0 });
  expect(Intent.create).toHaveBeenCalledWith(expect.objectContaining({ initialWalletAmount: 0, totalAmount: 149 }));
  expect(Captain.findOneAndUpdate).not.toHaveBeenCalled();
  expect(SubscriptionRecord.create).not.toHaveBeenCalled();
});

test('reuses an equivalent pending intent', async () => {
  const existing = intent();
  Intent.findOne.mockReturnValue(chain(existing));
  await expect(createSubscriptionPayment({ captainId, plan: 'monthly', initialWalletAmount: 500 })).resolves.toBe(existing);
  expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
});

test.each([
  ['invalid signature', { signature: 'bad' }],
  ['wrong order', { order: 'order_wrong' }],
  ['wrong payment', { payment: 'pay_wrong' }],
  ['wrong amount', { amount: 1 }],
  ['wrong currency', { currency: 'USD' }],
  ['not captured', { captured: false, status: 'created' }],
])('rejects %s verification', async (_name, options) => {
  const current = intent();
  configureIntent(current);
  mockRazorpay.payments.fetch.mockResolvedValue({ id: options.payment ? paymentId : paymentId, order_id: options.order || orderId, amount: options.amount || 64900, currency: options.currency || 'INR', captured: options.captured === undefined ? true : options.captured, status: options.status, method: 'upi' });
  const order = options.order || orderId;
  const payment = options.payment || paymentId;
  const providedSignature = options.signature || signature(order, payment);
  await expect(verifySubscriptionPayment({ intentId, captainId, razorpayOrderId: order, razorpayPaymentId: payment, razorpaySignature: providedSignature })).rejects.toBeInstanceOf(Error);
  expect(Captain.findOneAndUpdate).not.toHaveBeenCalled();
});

test('verifies and activates subscription with exact wallet credit once', async () => {
  const current = intent();
  configureIntent(current);
  const result = await verifySubscriptionPayment({ intentId, captainId, razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signature() });
  expect(result.alreadyProcessed).toBe(false);
  expect(Captain.findOneAndUpdate).toHaveBeenCalledWith({ _id: captainId }, expect.objectContaining({ $inc: { walletBalance: 500 } }), expect.objectContaining({ session: expect.anything() }));
  expect(SubscriptionRecord.create).toHaveBeenCalledWith([expect.objectContaining({ amount: 149, planType: 'monthly' })], expect.objectContaining({ session: expect.anything() }));
  expect(PaymentRecord.create).toHaveBeenCalledWith([expect.objectContaining({ paymentType: 'driver_subscription_wallet', subscriptionAmount: 149, initialWalletAmount: 500, totalAmount: 649, razorpayPaymentId: paymentId })], expect.objectContaining({ session: expect.anything() }));
});

test('zero-wallet verification leaves wallet increment at zero', async () => {
  const current = intent({ initialWalletAmount: 0, totalAmount: 149 });
  configureIntent(current);
  mockRazorpay.payments.fetch.mockResolvedValue({ id: paymentId, order_id: orderId, amount: 14900, currency: 'INR', captured: true });
  await verifySubscriptionPayment({ intentId, captainId, razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signature() });
  expect(Captain.findOneAndUpdate).toHaveBeenCalledWith({ _id: captainId }, expect.objectContaining({ $inc: { walletBalance: 0 } }), expect.anything());
});

test('duplicate success verification is idempotent', async () => {
  const current = intent({ status: 'success', razorpayPaymentId: paymentId });
  configureIntent(current);
  PaymentRecord.findOne.mockResolvedValue({ _id: 'payment-record-1' });
  const result = await verifySubscriptionPayment({ intentId, captainId, razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signature() });
  expect(result.alreadyProcessed).toBe(true);
  expect(Captain.findOneAndUpdate).not.toHaveBeenCalled();
  expect(PaymentRecord.findOne).toHaveBeenCalledWith({ paymentIntentId: intentId });
});

test('duplicate activation race resolves from the completed intent', async () => {
  const current = intent({ status: 'pending' });
  configureIntent(current);
  const session = await mongoose.startSession();
  session.withTransaction.mockRejectedValueOnce({ code: 11000 });
  const completed = intent({ status: 'success', razorpayPaymentId: paymentId });
  Intent.findOne.mockImplementation((query) => {
    if (query.status === 'success') return Promise.resolve(completed);
    return intentQuery(current);
  });
  PaymentRecord.findOne.mockResolvedValue({ _id: 'payment-record-1' });

  const result = await verifySubscriptionPayment({ intentId, captainId, razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signature() });

  expect(result.alreadyProcessed).toBe(true);
  expect(result.payment).toEqual({ _id: 'payment-record-1' });
});

test('wrong captain cannot verify the intent', async () => {
  Intent.findOne.mockImplementation(() => Promise.resolve(null));
  await expect(verifySubscriptionPayment({ intentId, captainId: otherCaptainId, razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signature() })).rejects.toMatchObject({ statusCode: 404 });
});

test('failure cannot downgrade a successful intent', async () => {
  const current = intent({ status: 'success' });
  Intent.findOne.mockResolvedValue(current);
  await expect(failSubscriptionPayment({ intentId, captainId, reason: 'failed' })).resolves.toBe(current);
  expect(current.save).toBeUndefined();
});

test('captured webhook validates and activates once', async () => {
  const current = intent();
  configureIntent(current);
  const result = await handleRazorpayWebhook('payment.captured', { payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: 64900, currency: 'INR', captured: true, notes: { paymentType: 'driver_subscription_wallet' } } } } });
  expect(result.handled).toBe(true);
  expect(Captain.findOneAndUpdate).toHaveBeenCalledTimes(1);
});

test('failed webhook does not downgrade success', async () => {
  const current = intent({ status: 'success' });
  current.save = jest.fn();
  configureIntent(current);
  await expect(handleRazorpayWebhook('payment.failed', { payload: { payment: { entity: { id: paymentId, order_id: orderId, notes: { paymentType: 'driver_subscription_wallet' } } } } })).resolves.toMatchObject({ handled: true });
  expect(current.save).not.toHaveBeenCalled();
});

test('wrong webhook amount is rejected', async () => {
  const current = intent();
  Intent.findOne.mockResolvedValue(current);
  await expect(handleRazorpayWebhook('payment.captured', { payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: 1, currency: 'INR', captured: true, notes: { paymentType: 'driver_subscription_wallet' } } } } })).rejects.toBeInstanceOf(Error);
});
