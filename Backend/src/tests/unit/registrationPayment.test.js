const crypto = require('crypto');

const mockRazorpay = {
  orders: { create: jest.fn() },
  payments: { fetch: jest.fn() },
};

jest.mock('razorpay', () => jest.fn(() => mockRazorpay));
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return { ...actual, startSession: jest.fn() };
});
jest.mock('../../models/registrationPayment.model', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  exists: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../../models/captain.model', () => ({
  findById: jest.fn(),
}));
jest.mock('../../models/captainOnboarding.model', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../../models/paymentRecord.model', () => ({
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../../services/pricing.service', () => ({
  getCaptainPricing: jest.fn(),
}));

const RegistrationPayment = require('../../models/registrationPayment.model');
const Captain = require('../../models/captain.model');
const CaptainOnboarding = require('../../models/captainOnboarding.model');
const PaymentRecord = require('../../models/paymentRecord.model');
const mongoose = require('mongoose');
const pricingService = require('../../services/pricing.service');
const {
  createRegistrationPayment,
  markRegistrationPaymentSuccess,
  markRegistrationPaymentFailed,
  handleRazorpayWebhook,
} = require('../../services/registrationPayment.service');

const captainId = '507f1f77bcf86cd799439011';
const otherCaptainId = '507f1f77bcf86cd799439012';
const paymentId = '507f1f77bcf86cd799439013';
const orderId = 'order_registration_1';
const razorpayPaymentId = 'pay_registration_1';
const secret = 'registration-test-secret';

const onboarding = {
  onboardingStatus: 'approved',
  personalInformation: {
    legalFullName: 'Test Captain',
    dateOfBirth: '1990-01-01',
    mobileNumber: '9999999999',
    gender: 'other',
    residentialAddress: 'Test Address',
    servingCity: 'Kolhapur',
    profilePhoto: 'profile.jpg',
  },
  identityVerification: {
    identityDocumentType: 'aadhaar',
    identityDocumentNumber: 'TEST-ID-1',
    nameAsPerIdentityDocument: 'Test Captain',
    dateOfBirthAsPerIdentityDocument: '1990-01-01',
    identityDocumentFront: 'id-front.jpg',
    identityDocumentBack: 'id-back.jpg',
  },
  drivingLicence: {
    drivingLicenceNumber: 'LIC12345',
    nameAsPerDrivingLicence: 'Test Captain',
    dateOfBirthAsPerDrivingLicence: '1990-01-01',
    licenceClass: 'transport',
    licenceIssueDate: '2020-01-01',
    licenceExpiryDate: '2030-01-01',
    drivingLicenceFront: 'licence-front.jpg',
    drivingLicenceBack: 'licence-back.jpg',
  },
  vehicleInformation: {
    vehicleRegistrationNumber: 'MH12AB1234',
    vehicleType: 'AUTO',
    vehicleManufacturer: 'Test',
    vehicleModel: 'Model',
    manufacturingYear: 2023,
    fuelType: 'CNG',
    seatingCapacity: 3,
    vehicleOwnershipType: 'owned',
    rcNumber: 'RC12345',
    nameAsPerRC: 'Test Captain',
    rcDocumentFront: 'rc-front.jpg',
    rcDocumentBack: 'rc-back.jpg',
  },
  insurance: {
    insurancePolicyNumber: 'INS12345',
    policyHolderName: 'Test Captain',
    insuranceExpiryDate: '2030-01-01',
    insuranceCertificate: 'insurance.jpg',
  },
};

function signature(order = orderId, payment = razorpayPaymentId) {
  return crypto.createHmac('sha256', secret).update(`${order}|${payment}`).digest('hex');
}

function pendingPayment(overrides = {}) {
  return {
    _id: paymentId,
    captainId,
    amount: 1,
    paymentStatus: 'pending',
    razorpayOrderId: orderId,
    save: jest.fn(async function save() { return this; }),
    ...overrides,
  };
}

function sessionQuery(value) {
  const query = {
    session: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RAZORPAY_KEY_ID = 'test-key';
  process.env.RAZORPAY_KEY_SECRET = secret;
  Captain.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: captainId, approved: true, blocked: false }) });
  CaptainOnboarding.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(onboarding) });
  CaptainOnboarding.findOneAndUpdate.mockResolvedValue({});
  RegistrationPayment.findOneAndUpdate.mockImplementation(async (_filter, update) => ({
    ...pendingPayment(),
    ...(update?.$set || {}),
  }));
  PaymentRecord.findOneAndUpdate.mockResolvedValue({ _id: 'registration-ledger-1' });
  mongoose.startSession.mockResolvedValue({
    withTransaction: jest.fn(async (callback) => callback()),
    endSession: jest.fn(),
  });
  RegistrationPayment.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) });
  pricingService.getCaptainPricing.mockResolvedValue({ registrationFee: 1 });
  mockRazorpay.orders.create.mockResolvedValue({ id: orderId, amount: 100, currency: 'INR' });
  RegistrationPayment.create.mockResolvedValue(pendingPayment());
  mockRazorpay.payments.fetch.mockResolvedValue({
    id: razorpayPaymentId,
    order_id: orderId,
    amount: 100,
    currency: 'INR',
    captured: true,
    method: 'upi',
  });
});

test('uses admin-configured fee and INR paise amount', async () => {
  pricingService.getCaptainPricing.mockResolvedValue({ registrationFee: 149.5 });
  mockRazorpay.orders.create.mockResolvedValue({ id: orderId });

  await createRegistrationPayment(captainId);

  expect(mockRazorpay.orders.create).toHaveBeenCalledWith(expect.objectContaining({
    amount: 14950,
    currency: 'INR',
  }));
  expect(RegistrationPayment.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 149.5 }));
});

test.each([
  ['unapproved captain', { approved: false }, null, 403],
  ['incomplete onboarding', { approved: true }, { ...onboarding, insurance: {} }, 400],
  ['unsubmitted onboarding', { approved: true }, { ...onboarding, onboardingStatus: 'submitted' }, 403],
])('rejects %s before creating an order', async (_name, captain, onboardingDoc, status) => {
  Captain.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: captainId, blocked: false, ...captain }) });
  CaptainOnboarding.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(onboardingDoc) });

  await expect(createRegistrationPayment(captainId)).rejects.toMatchObject({ statusCode: status });
  expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
});

test('rejects a captain who already paid', async () => {
  RegistrationPayment.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(pendingPayment({ paymentStatus: 'success' })) });

  await expect(createRegistrationPayment(captainId)).rejects.toMatchObject({ statusCode: 409 });
  expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
});

test('returns an existing pending payment instead of creating another order', async () => {
  const existing = pendingPayment();
  RegistrationPayment.findOne.mockImplementation((query) => ({
    sort: jest.fn().mockResolvedValue(
      query.paymentStatus === 'pending' ? existing : null,
    ),
  }));

  await expect(createRegistrationPayment(captainId)).resolves.toBe(existing);
  expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
});

test('rejects verification for a different captain', async () => {
  RegistrationPayment.findOne.mockImplementation((query) => {
    if (String(query.captainId) !== captainId) return pendingPayment({ captainId: otherCaptainId });
    return null;
  });

  await expect(markRegistrationPaymentSuccess(paymentId, captainId, {
    razorpay_order_id: orderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: signature(),
  })).rejects.toMatchObject({ statusCode: 404 });
});

test.each([
  ['invalid signature', { razorpay_signature: 'bad' }],
  ['wrong order', { razorpay_order_id: 'order_wrong' }],
  ['wrong payment', { razorpay_payment_id: 'pay_wrong' }],
  ['wrong amount', { payment: { amount: 200 } }],
  ['non-captured payment', { payment: { captured: false, status: 'created' } }],
])('rejects %s', async (_name, options) => {
  const payment = pendingPayment();
  RegistrationPayment.findOne.mockReturnValue(payment);
  if (options.payment) mockRazorpay.payments.fetch.mockResolvedValue({
    id: razorpayPaymentId,
    order_id: orderId,
    amount: 100,
    currency: 'INR',
    captured: true,
    method: 'upi',
    ...options.payment,
  });
  const args = {
    razorpay_order_id: options.razorpay_order_id || orderId,
    razorpay_payment_id: options.razorpay_payment_id || razorpayPaymentId,
    razorpay_signature: options.razorpay_signature || signature(options.razorpay_order_id || orderId, options.razorpay_payment_id || razorpayPaymentId),
  };

  await expect(markRegistrationPaymentSuccess(paymentId, captainId, args)).rejects.toBeInstanceOf(Error);
  expect(payment.save).not.toHaveBeenCalled();
});

test('verifies success, stores Razorpay identifiers, and syncs onboarding fields', async () => {
  const payment = pendingPayment();
  RegistrationPayment.findOne.mockReturnValue(payment);

  const result = await markRegistrationPaymentSuccess(paymentId, captainId, {
    razorpay_order_id: orderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: signature(),
  });

  expect(result.alreadyProcessed).toBe(false);
  expect(result.payment.paymentStatus).toBe('success');
  expect(result.payment.razorpayPaymentId).toBe(razorpayPaymentId);
  expect(result.payment.transactionId).toBe(razorpayPaymentId);
  expect(CaptainOnboarding.findOneAndUpdate).toHaveBeenCalledWith(
    { captainId },
    expect.objectContaining({ $set: expect.objectContaining({ 'registrationFee.status': 'paid' }) }),
    expect.objectContaining({ new: true, session: expect.anything() }),
  );
});

test('duplicate success verification is idempotent', async () => {
  const payment = pendingPayment({ paymentStatus: 'success', razorpayPaymentId, razorpaySignature: signature() });
  RegistrationPayment.findOne.mockReturnValue(payment);

  const result = await markRegistrationPaymentSuccess(paymentId, captainId, {
    razorpay_order_id: orderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: signature(),
  });

  expect(result.alreadyProcessed).toBe(true);
  expect(mockRazorpay.payments.fetch).not.toHaveBeenCalled();
  expect(payment.save).not.toHaveBeenCalled();
});

test('failure callback cannot downgrade a successful payment', async () => {
  const payment = pendingPayment({ paymentStatus: 'success' });
  RegistrationPayment.findOne.mockReturnValue(payment);

  await expect(markRegistrationPaymentFailed(paymentId, captainId, 'failed')).resolves.toBe(payment);
  expect(payment.save).not.toHaveBeenCalled();
});

test('registration webhook validates amount and is idempotent', async () => {
  const payment = pendingPayment();
  RegistrationPayment.findOne.mockReturnValue(payment);
  const payload = { payload: { payment: { entity: {
    id: razorpayPaymentId,
    order_id: orderId,
    amount: 100,
    currency: 'INR',
    captured: true,
    method: 'upi',
  } } } };

  const firstResult = await handleRazorpayWebhook('payment.captured', payload);
  expect(firstResult).toMatchObject({ handled: true, payment: { paymentStatus: 'success' } });

  const already = pendingPayment({ paymentStatus: 'success' });
  RegistrationPayment.findOne.mockReturnValue(already);
  await expect(handleRazorpayWebhook('payment.captured', payload)).resolves.toMatchObject({ handled: true });
  expect(already.save).not.toHaveBeenCalled();
});

test('registration webhook rejects an incorrect amount', async () => {
  const payment = pendingPayment();
  RegistrationPayment.findOne.mockReturnValue(payment);
  const payload = { payload: { payment: { entity: {
    id: razorpayPaymentId,
    order_id: orderId,
    amount: 200,
    currency: 'INR',
    captured: true,
  } } } };

  await expect(handleRazorpayWebhook('payment.captured', payload)).rejects.toMatchObject({ statusCode: 400 });
  expect(payment.save).not.toHaveBeenCalled();
});

test('failed webhook does not downgrade a successful registration payment', async () => {
  const payment = pendingPayment({ paymentStatus: 'success' });
  RegistrationPayment.findOne.mockReturnValue(payment);

  await expect(handleRazorpayWebhook('payment.failed', {
    payload: { payment: { entity: { id: razorpayPaymentId, order_id: orderId, amount: 100 } } },
  })).resolves.toMatchObject({ handled: true });
  expect(payment.save).not.toHaveBeenCalled();
});

test('successful registration verification creates one unified PaymentRecord', async () => {
  const payment = pendingPayment();
  RegistrationPayment.findOne.mockReturnValue(payment);

  const result = await markRegistrationPaymentSuccess(paymentId, captainId, {
    razorpay_order_id: orderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: signature(),
  });

  expect(result.paymentRecord).toBeDefined();
  expect(PaymentRecord.findOneAndUpdate).toHaveBeenCalledWith(
    { paymentIntentId: paymentId },
    { $setOnInsert: expect.objectContaining({
      driverId: captainId,
      amount: 1,
      paymentType: 'registration_fee',
      paymentMode: 'Razorpay',
      paymentStatus: 'success',
      paymentIntentId: paymentId,
      paymentIntentModel: 'RegistrationPayment',
      currency: 'INR',
      razorpayOrderId: orderId,
      razorpayPaymentId,
      razorpaySignature: signature(),
    }) },
    expect.objectContaining({ new: true, upsert: true, session: expect.anything() }),
  );
});

test('duplicate verification upserts the same ledger key without creating another record', async () => {
  const payment = pendingPayment();
  const completed = pendingPayment({ paymentStatus: 'success', razorpayPaymentId, razorpaySignature: signature() });
  RegistrationPayment.findOne
    .mockReturnValueOnce(payment)
    .mockReturnValueOnce(payment)
    .mockReturnValueOnce(completed)
    .mockReturnValueOnce(completed);
  let ledger;
  PaymentRecord.findOneAndUpdate.mockImplementation(async (_filter, update) => {
    if (!ledger) ledger = { _id: 'registration-ledger-1', ...update.$setOnInsert };
    return ledger;
  });

  await markRegistrationPaymentSuccess(paymentId, captainId, {
    razorpay_order_id: orderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: signature(),
  });
  const result = await markRegistrationPaymentSuccess(paymentId, captainId, {
    razorpay_order_id: orderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: signature(),
  });

  expect(result.alreadyProcessed).toBe(true);
  expect(PaymentRecord.findOneAndUpdate).toHaveBeenCalledTimes(2);
  expect(ledger.paymentType).toBe('registration_fee');
});

test('duplicate captured webhooks upsert one registration ledger record', async () => {
  const payment = pendingPayment();
  RegistrationPayment.findOne.mockReturnValue(payment);
  let ledger;
  PaymentRecord.findOneAndUpdate.mockImplementation(async (_filter, update) => {
    if (!ledger) ledger = { _id: 'registration-ledger-1', ...update.$setOnInsert };
    return ledger;
  });
  const payload = { payload: { payment: { entity: {
    id: razorpayPaymentId,
    order_id: orderId,
    amount: 100,
    currency: 'INR',
    captured: true,
    method: 'upi',
  } } } };

  await handleRazorpayWebhook('payment.captured', payload);
  payment.paymentStatus = 'success';
  payment.razorpayPaymentId = razorpayPaymentId;
  await handleRazorpayWebhook('payment.captured', payload);

  expect(PaymentRecord.findOneAndUpdate).toHaveBeenCalledTimes(2);
  expect(ledger.paymentIntentId).toBe(paymentId);
});

test('verification and webhook race share one registration ledger key', async () => {
  const payment = pendingPayment();
  let ledger;
  let transactionTail = Promise.resolve();
  mongoose.startSession.mockImplementation(() => ({
    withTransaction: (callback) => {
      const previous = transactionTail;
      let release;
      transactionTail = new Promise((resolve) => { release = resolve; });
      return previous.then(async () => {
        try {
          return await callback();
        } finally {
          release();
        }
      });
    },
    endSession: jest.fn(),
  }));
  RegistrationPayment.findOne.mockImplementation(() => sessionQuery(payment));
  RegistrationPayment.findOneAndUpdate.mockImplementation(async (_filter, update) => {
    if (payment.paymentStatus === 'success') return null;
    Object.assign(payment, update.$set);
    return payment;
  });
  PaymentRecord.findOneAndUpdate.mockImplementation(async (_filter, update) => {
    if (!ledger) ledger = { _id: 'registration-ledger-1', ...update.$setOnInsert };
    return ledger;
  });
  const payload = { payload: { payment: { entity: {
    id: razorpayPaymentId,
    order_id: orderId,
    amount: 100,
    currency: 'INR',
    captured: true,
    method: 'upi',
  } } } };

  const results = await Promise.all([
    markRegistrationPaymentSuccess(paymentId, captainId, {
      razorpay_order_id: orderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: signature(),
    }),
    handleRazorpayWebhook('payment.captured', payload),
  ]);

  expect(results[0].payment.paymentStatus).toBe('success');
  expect(results[1].payment.paymentStatus).toBe('success');
  expect(PaymentRecord.findOneAndUpdate).toHaveBeenCalledTimes(2);
  expect(ledger.paymentIntentId).toBe(paymentId);
});
