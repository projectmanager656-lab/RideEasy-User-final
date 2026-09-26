jest.mock("mongoose", () => ({
  isValidObjectId: jest.fn(() => true),
  startSession: jest.fn(),
}));
jest.mock("../../models/rideCore.model", () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findById: jest.fn(),
}));
jest.mock("../../models/captain.model", () => ({
  findOneAndUpdate: jest.fn(),
}));
jest.mock("../../models/paymentRecord.model", () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../../services/pricing.service", () => ({
  getCommissionPercent: jest.fn(),
}));
jest.mock("../../utils/logger", () => ({
  payment: jest.fn(),
}));

const mongoose = require("mongoose");
const rideModel = require("../../models/rideCore.model");
const captainModel = require("../../models/captain.model");
const PaymentRecord = require("../../models/paymentRecord.model");
const pricingService = require("../../services/pricing.service");
const { settleRidePaymentIfNeeded } = require("../../services/payment.service");

function chain(value) {
  return {
    select: jest.fn(() => chain(value)),
    populate: jest.fn(() => chain(value)),
    session: jest.fn(() => Promise.resolve(value)),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
}

describe("captain wallet payment settlement", () => {
  test("deducts the platform fee without adding captain earnings to wallet", async () => {
    const session = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn(),
    };
    mongoose.startSession.mockResolvedValue(session);
    pricingService.getCommissionPercent.mockResolvedValue(10);
    rideModel.findOne.mockReturnValue(
      chain({
        captainNetEarning: null,
        price: 150,
        discountAmount: 0,
        captain: "captain-id",
        paymentStatus: "pending",
      }),
    );
    rideModel.findOneAndUpdate.mockResolvedValue({
      _id: "ride-id",
      captain: "captain-id",
      chargedAmount: 150,
      platformFee: 15,
      captainNetEarning: 135,
    });
    captainModel.findOneAndUpdate.mockResolvedValue({
      _id: "captain-id",
      walletBalance: 85,
    });
    PaymentRecord.findOne.mockReturnValue(chain(null));
    PaymentRecord.create.mockResolvedValue([{ _id: "ledger-id" }]);
    rideModel.findById.mockReturnValue(chain({ _id: "ride-id" }));

    await settleRidePaymentIfNeeded("ride-id");

    expect(captainModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "captain-id" },
      [
        {
          $set: expect.objectContaining({
            walletBalance: {
              $max: [
                {
                  $subtract: [
                    { $ifNull: ["$walletBalance", 0] },
                    15,
                  ],
                },
                0,
              ],
            },
            totalEarnings: {
              $add: [{ $ifNull: ["$totalEarnings", 0] }, 135],
            },
          }),
        },
      ],
      expect.objectContaining({ new: true, session }),
    );
    expect(session.endSession).toHaveBeenCalled();
  });
});
