jest.mock("../../models/service.model", () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock("../../models/pricing.model", () => ({ findOne: jest.fn() }));

const Service = require("../../models/service.model");
const pricingService = require("../../services/pricing.service");

beforeEach(() => jest.clearAllMocks());

test("returns the stored captain approach rate without changing other captain pricing fields", async () => {
  const storedService = {
    serviceAreas: [{ key: "test" }],
    commissionPercent: 15,
    launchTrialDays: 0,
    rates: { BIKE: {}, AUTO: {}, CAR: {} },
    driverPlans: { BIKE: {}, AUTO: {}, CAR: {} },
    captainPricing: {
      registrationFee: 149,
      minimumWalletBalance: 50,
      arriveAmountPerKm: 10,
      platformFee: 7,
    },
  };
  Service.findOne.mockResolvedValue(storedService);
  Service.findOneAndUpdate.mockResolvedValue(storedService);

  await expect(pricingService.getCaptainPricing()).resolves.toEqual({
    registrationFee: 149,
    minimumWalletBalance: 50,
    arriveAmountPerKm: 10,
    platformFee: 7,
  });
  expect(Service.findOneAndUpdate).not.toHaveBeenCalled();
});

test("does not persist a default arrival rate when an existing document is missing it", async () => {
  const storedService = {
    serviceAreas: [{ key: "test" }],
    commissionPercent: 15,
    launchTrialDays: 0,
    rates: { BIKE: {}, AUTO: {}, CAR: {} },
    driverPlans: { BIKE: {}, AUTO: {}, CAR: {} },
    captainPricing: {
      registrationFee: 1,
      minimumWalletBalance: 50,
      platformFee: 10,
    },
  };
  Service.findOne.mockResolvedValue(storedService);

  await expect(pricingService.getCaptainPricing()).resolves.toEqual({
    registrationFee: 1,
    minimumWalletBalance: 50,
    platformFee: 10,
  });
  expect(Service.findOneAndUpdate).not.toHaveBeenCalled();
});

test("Admin pricing update explicitly persists a missing arrival rate", async () => {
  const storedService = {
    serviceAreas: [{ key: "test" }],
    commissionPercent: 15,
    launchTrialDays: 0,
    rates: { BIKE: {}, AUTO: {}, CAR: {} },
    driverPlans: { BIKE: {}, AUTO: {}, CAR: {} },
    captainPricing: {
      registrationFee: 1,
      minimumWalletBalance: 50,
      platformFee: 10,
    },
  };
  Service.findOne.mockResolvedValue(storedService);
  Service.findOneAndUpdate.mockResolvedValue(storedService);

  await pricingService.updateCaptainPricing({ arriveAmountPerKm: 10 });

  expect(Service.findOneAndUpdate).toHaveBeenCalledWith(
    { key: "global" },
    { $set: { captainPricing: expect.objectContaining({
      registrationFee: 1,
      minimumWalletBalance: 50,
      arriveAmountPerKm: 10,
      platformFee: 10,
    }) } },
    { new: true, upsert: true },
  );
});

test("an explicit stored arrival rate remains unchanged on read", async () => {
  const storedService = {
    serviceAreas: [{ key: "test" }],
    commissionPercent: 15,
    launchTrialDays: 0,
    rates: { BIKE: {}, AUTO: {}, CAR: {} },
    driverPlans: { BIKE: {}, AUTO: {}, CAR: {} },
    captainPricing: {
      registrationFee: 1,
      minimumWalletBalance: 50,
      arriveAmountPerKm: 10,
      platformFee: 10,
    },
  };
  Service.findOne.mockResolvedValue(storedService);

  await expect(pricingService.getCaptainPricing()).resolves.toEqual({
    registrationFee: 1,
    minimumWalletBalance: 50,
    arriveAmountPerKm: 10,
    platformFee: 10,
  });
  expect(Service.findOneAndUpdate).not.toHaveBeenCalled();
});
