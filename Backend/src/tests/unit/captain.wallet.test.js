jest.mock("../../models/captain.model", () => ({
  findOneAndUpdate: jest.fn(),
}));

const captainModel = require("../../models/captain.model");
const captainController = require("../../controllers/captain.controller");

function responseFor() {
  const response = {};
  response.status = jest.fn(() => response);
  response.json = jest.fn(() => response);
  return response;
}

describe("captain wallet recharge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("rejects non-positive or unsafe amounts", async () => {
    const response = responseFor();

    await captainController.addWalletBalance(
      { body: { amount: 0 }, captain: { _id: "captain-id" } },
      response,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(captainModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("increments the wallet and returns the updated balance", async () => {
    const response = responseFor();
    captainModel.findOneAndUpdate.mockResolvedValue({ walletBalance: 300 });

    await captainController.addWalletBalance(
      { body: { amount: 200 }, captain: { _id: "captain-id" } },
      response,
    );

    expect(captainModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "captain-id" },
      { $inc: { walletBalance: 200 } },
      { new: true },
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { walletBalance: 300 },
      }),
    );
  });
});
