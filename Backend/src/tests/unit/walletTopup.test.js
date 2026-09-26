const crypto = require('crypto');

const mockRazorpay = { orders: { create: jest.fn() }, payments: { fetch: jest.fn() } };

jest.mock('razorpay', () => jest.fn(() => mockRazorpay));
jest.mock('mongoose', () => ({ startSession: jest.fn() }));
jest.mock('../../models/captain.model', () => ({ findById: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('../../models/captainOnboarding.model', () => ({ findOne: jest.fn() }));
jest.mock('../../models/paymentRecord.model', () => ({ create: jest.fn(), findOne: jest.fn() }));
jest.mock('../../models/walletTopupIntent.model', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn(), create: jest.fn() }));
jest.mock('../../services/pricing.service', () => ({ getCaptainPricing: jest.fn() }));
jest.mock('../../services/registrationPayment.service', () => ({ hasPaidRegistrationFee: jest.fn() }));

const mongoose = require('mongoose');
const Captain = require('../../models/captain.model');
const CaptainOnboarding = require('../../models/captainOnboarding.model');
const PaymentRecord = require('../../models/paymentRecord.model');
const Intent = require('../../models/walletTopupIntent.model');
const pricingService = require('../../services/pricing.service');
const registrationPayment = require('../../services/registrationPayment.service');
const {
  createWalletTopup,
  verifyWalletTopup,
  failWalletTopup,
  handleRazorpayWebhook,
} = require('../../services/walletTopup.service');

const captainId = '507f1f77bcf86cd799439011';
const otherCaptainId = '507f1f77bcf86cd799439012';
const intentId = '507f1f77bcf86cd799439013';
const orderId = 'order_wallet_1';
const paymentId = 'pay_wallet_1';
const secret = 'wallet-test-secret';

const onboarding = {
  onboardingStatus: 'approved',
  personalInformation: { legalFullName: 'Test', dateOfBirth: '1990-01-01', mobileNumber: '9999999999', gender: 'other', residentialAddress: 'Address', servingCity: 'Kolhapur', profilePhoto: 'profile.jpg' },
  identityVerification: { identityDocumentType: 'aadhaar', identityDocumentNumber: 'ID12345', nameAsPerIdentityDocument: 'Test', dateOfBirthAsPerIdentityDocument: '1990-01-01', identityDocumentFront: 'front.jpg', identityDocumentBack: 'back.jpg' },
  drivingLicence: { drivingLicenceNumber: 'LIC12345', nameAsPerDrivingLicence: 'Test', dateOfBirthAsPerDrivingLicence: '1990-01-01', licenceClass: 'transport', licenceIssueDate: '2020-01-01', licenceExpiryDate: '2030-01-01', drivingLicenceFront: 'front.jpg', drivingLicenceBack: 'back.jpg' },
  vehicleInformation: { vehicleRegistrationNumber: 'MH12AB1234', vehicleType: 'AUTO', vehicleManufacturer: 'Test', vehicleModel: 'Model', manufacturingYear: 2023, fuelType: 'CNG', seatingCapacity: 3, vehicleOwnershipType: 'owned', rcNumber: 'RC12345', nameAsPerRC: 'Test', rcDocumentFront: 'front.jpg', rcDocumentBack: 'back.jpg' },
  insurance: { insurancePolicyNumber: 'INS12345', policyHolderName: 'Test', insuranceExpiryDate: '2030-01-01', insuranceCertificate: 'insurance.jpg' },
};

function signature(order = orderId, payment = paymentId) {
  return crypto.createHmac('sha256', secret).update(`${order}|${payment}`).digest('hex');
}

function chain(value) {
  return { sort: jest.fn(() => Promise.resolve(value)), session: jest.fn(() => Promise.resolve(value)), lean: jest.fn(() => Promise.resolve(value)) };
}

function query(value) {
  return Object.assign(value || {}, { sort: jest.fn(() => Promise.resolve(value)), session: jest.fn(() => Promise.resolve(value)) });
}

function intent(overrides = {}) {
  return { _id: intentId, captainId, paymentType: 'driver_wallet_topup', walletBalanceSnapshot: 30, minimumWalletBalance: 50, requiredTopUp: 20, totalAmount: 20, currency: 'INR', razorpayOrderId: orderId, razorpayPaymentId: null, status: 'pending', ...overrides };
}

function configureCaptain(overrides = {}) {
  const doc = { _id: captainId, approved: true, blocked: false, status: 'active', subscriptionStatus: 'active', subscriptionExpiresAt: new Date('2030-01-01'), walletBalance: 30, ...overrides };
  Captain.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(doc), session: jest.fn(() => Promise.resolve(doc)) });
}

function configureIntent(doc = intent()) {
  Intent.findOne.mockImplementation((filter) => {
    if (filter.status === 'pending' && filter.captainId === captainId) return chain(doc.status === 'pending' ? doc : null);
    if (filter.status === 'success') return query(doc.status === 'success' ? doc : null);
    if (filter.razorpayOrderId === orderId) return query(doc);
    if (filter._id === intentId && filter.captainId === captainId) return query(doc);
    return chain(null);
  });
  Intent.findOneAndUpdate.mockResolvedValue({ ...doc, status: 'success', razorpayPaymentId: paymentId });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RAZORPAY_KEY_ID = 'test-key';
  process.env.RAZORPAY_KEY_SECRET = secret;
  configureCaptain();
  CaptainOnboarding.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(onboarding) });
  registrationPayment.hasPaidRegistrationFee.mockResolvedValue(true);
  pricingService.getCaptainPricing.mockResolvedValue({ minimumWalletBalance: 50 });
  Intent.findOne.mockReturnValue(chain(null));
  Intent.create.mockImplementation(async (document) => ({ _id: intentId, ...document }));
  mockRazorpay.orders.create.mockResolvedValue({ id: orderId, amount: 2000, currency: 'INR' });
  mockRazorpay.payments.fetch.mockResolvedValue({ id: paymentId, order_id: orderId, amount: 2000, currency: 'INR', captured: true, method: 'upi' });
  mongoose.startSession.mockResolvedValue({ withTransaction: jest.fn(async (callback) => callback()), endSession: jest.fn() });
  PaymentRecord.create.mockResolvedValue([{ _id: 'payment-record-1' }]);
  Captain.findOneAndUpdate.mockResolvedValue({ _id: captainId, walletBalance: 50, subscriptionStatus: 'active', subscriptionExpiresAt: new Date('2030-01-01') });
  Intent.findOneAndUpdate.mockResolvedValue({ ...intent(), status: 'success', razorpayPaymentId: paymentId });
});

test.each([
  ['no active subscription', { subscriptionStatus: 'none' }, 403],
  ['expired subscription', { subscriptionExpiresAt: new Date('2020-01-01') }, 403],
  ['blocked captain', { blocked: true }, 403],
  ['unapproved captain', { approved: false }, 403],
  ['inactive captain', { status: 'inactive' }, 403],
])('rejects %s', async (_name, captain, status) => {
  configureCaptain(captain);
  await expect(createWalletTopup(captainId)).rejects.toMatchObject({ statusCode: status });
  expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
});

test('rejects unpaid registration and incomplete onboarding', async () => {
  registrationPayment.hasPaidRegistrationFee.mockResolvedValue(false);
  await expect(createWalletTopup(captainId)).rejects.toMatchObject({ statusCode: 403 });
  registrationPayment.hasPaidRegistrationFee.mockResolvedValue(true);
  CaptainOnboarding.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ ...onboarding, insurance: {} }) });
  await expect(createWalletTopup(captainId)).rejects.toMatchObject({ statusCode: 400 });
});

test.each([
  [30, 20, 2000],
  [49, 1, 100],
])('calculates deficit from server wallet and minimum: wallet %i -> top-up %i', async (wallet, topUp, paise) => {
  configureCaptain({ walletBalance: wallet });
  const result = await createWalletTopup(captainId);
  expect(result.requiredTopUp).toBe(topUp);
  expect(mockRazorpay.orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: paise, currency: 'INR' }));
  expect(Intent.create).toHaveBeenCalledWith(expect.objectContaining({ walletBalanceSnapshot: wallet, minimumWalletBalance: 50, requiredTopUp: topUp, totalAmount: topUp }));
});

test.each([50, 72])('does not create an order when wallet is %i or higher', async (wallet) => {
  configureCaptain({ walletBalance: wallet });
  await expect(createWalletTopup(captainId)).resolves.toMatchObject({ noTopUpRequired: true, requiredTopUp: 0 });
  expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
  expect(Intent.create).not.toHaveBeenCalled();
});

test('uses the live admin minimum and ignores client amount', async () => {
  configureCaptain({ walletBalance: 30 });
  pricingService.getCaptainPricing.mockResolvedValue({ minimumWalletBalance: 75 });
  const result = await createWalletTopup(captainId);
  expect(result.requiredTopUp).toBe(45);
  expect(mockRazorpay.orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 4500 }));
});

test('reuses an existing pending intent', async () => {
  const existing = intent();
  Intent.findOne.mockReturnValue(chain(existing));
  await expect(createWalletTopup(captainId)).resolves.toBe(existing);
  expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
});

test.each([
  ['invalid signature', { signature: 'bad' }],
  ['wrong order', { order: 'order_wrong' }],
  ['wrong payment', { payment: 'pay_wrong' }],
  ['wrong amount', { amount: 1 }],
  ['non-captured payment', { captured: false, status: 'created' }],
])('rejects %s verification', async (_name, options) => {
  const current = intent();
  configureIntent(current);
  mockRazorpay.payments.fetch.mockResolvedValue({ id: paymentId, order_id: options.order || orderId, amount: options.amount || 2000, currency: 'INR', captured: options.captured === undefined ? true : options.captured, status: options.status });
  const order = options.order || orderId;
  const payment = options.payment || paymentId;
  await expect(verifyWalletTopup({ intentId, captainId, razorpayOrderId: order, razorpayPaymentId: payment, razorpaySignature: options.signature || signature(order, payment) })).rejects.toBeInstanceOf(Error);
  expect(Captain.findOneAndUpdate).not.toHaveBeenCalled();
});

test('wrong captain cannot verify another intent', async () => {
  Intent.findOne.mockImplementation(() => Promise.resolve(null));
  await expect(verifyWalletTopup({ intentId, captainId: otherCaptainId, razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signature() })).rejects.toMatchObject({ statusCode: 404 });
});

test('successful verification credits exact wallet amount and preserves subscription', async () => {
  const current = intent();
  configureIntent(current);
  const result = await verifyWalletTopup({ intentId, captainId, razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signature() });
  expect(result.alreadyProcessed).toBe(false);
  expect(Captain.findOneAndUpdate).toHaveBeenCalledWith({ _id: captainId }, { $inc: { walletBalance: 20 } }, expect.objectContaining({ session: expect.anything() }));
  expect(Captain.findOneAndUpdate.mock.calls[0][1]).not.toHaveProperty('$set');
  expect(PaymentRecord.create).toHaveBeenCalledWith([expect.objectContaining({ paymentType: 'driver_wallet_topup', amount: 20, totalAmount: 20, walletBalanceBefore: 30, minimumWalletBalance: 50, razorpayPaymentId: paymentId })], expect.objectContaining({ session: expect.anything() }));
});

test('duplicate verification is idempotent', async () => {
  const current = intent({ status: 'success', razorpayPaymentId: paymentId });
  configureIntent(current);
  PaymentRecord.findOne.mockResolvedValue({ _id: 'payment-record-1' });
  const result = await verifyWalletTopup({ intentId, captainId, razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signature() });
  expect(result.alreadyProcessed).toBe(true);
  expect(Captain.findOneAndUpdate).not.toHaveBeenCalled();
  expect(PaymentRecord.findOne).toHaveBeenCalledWith({ paymentIntentId: intentId });
});

test('failed payment does not credit wallet', async () => {
  const current = intent();
  current.save = jest.fn();
  Intent.findOne.mockReturnValue(query(current));
  await failWalletTopup({ intentId, captainId, reason: 'declined' });
  expect(current.status).toBe('failed');
  expect(Captain.findOneAndUpdate).not.toHaveBeenCalled();
});

test('failure cannot downgrade success', async () => {
  const current = intent({ status: 'success' });
  current.save = jest.fn();
  Intent.findOne.mockReturnValue(query(current));
  await expect(failWalletTopup({ intentId, captainId, reason: 'declined' })).resolves.toBe(current);
  expect(current.save).not.toHaveBeenCalled();
});

test('captured webhook validates and credits once', async () => {
  const current = intent();
  configureIntent(current);
  const result = await handleRazorpayWebhook('payment.captured', { payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: 2000, currency: 'INR', captured: true, notes: { paymentType: 'driver_wallet_topup' } } } } });
  expect(result.handled).toBe(true);
  expect(Captain.findOneAndUpdate).toHaveBeenCalledTimes(1);
});

test('failed webhook does not downgrade success', async () => {
  const current = intent({ status: 'success' });
  current.save = jest.fn();
  configureIntent(current);
  await expect(handleRazorpayWebhook('payment.failed', { payload: { payment: { entity: { id: paymentId, order_id: orderId, notes: { paymentType: 'driver_wallet_topup' } } } } })).resolves.toMatchObject({ handled: true });
  expect(current.save).not.toHaveBeenCalled();
});

test('wrong webhook amount is rejected', async () => {
  const current = intent();
  Intent.findOne.mockReturnValue(query(current));
  await expect(handleRazorpayWebhook('payment.captured', { payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: 1, currency: 'INR', captured: true, notes: { paymentType: 'driver_wallet_topup' } } } } })).rejects.toBeInstanceOf(Error);
});

test('concurrent activation race resolves as already processed', async () => {
  const current = intent();
  configureIntent(current);
  const session = await mongoose.startSession();
  session.withTransaction.mockRejectedValueOnce({ code: 11000 });
  const completed = intent({ status: 'success', razorpayPaymentId: paymentId });
  Intent.findOne.mockImplementation((filter) => {
    if (filter.status === 'success') return Promise.resolve(completed);
    return query(current);
  });
  PaymentRecord.findOne.mockResolvedValue({ _id: 'payment-record-1' });
  const result = await verifyWalletTopup({ intentId, captainId, razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signature() });
  expect(result.alreadyProcessed).toBe(true);
  expect(result.payment).toEqual({ _id: 'payment-record-1' });
});
