jest.mock("../../models/rideCore.model", () => ({
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../models/captain.model", () => ({
  updateOne: jest.fn(),
}));
jest.mock("../../services/maps.service", () => ({}));

const rideModel = require("../../models/rideCore.model");
const captainModel = require("../../models/captain.model");
const rideService = require("../../services/rideCore.service");

function populatedQuery(value) {
  const query = {
    populate: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
}

describe("ride core offer assignment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    captainModel.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 });
  });

  test("uses an atomic searching predicate for first acceptance", async () => {
    rideModel.findOneAndUpdate.mockReturnValue(populatedQuery({
        _id: "ride-x",
        captain: "captain-b",
        status: "accepted",
    }));

    const accepted = await rideService.confirmRide({
      rideId: "ride-x",
      captain: { _id: "captain-b" },
    });

    expect(rideModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: "ride-x",
        status: "searching",
        $or: [{ captain: null }, { captain: { $exists: false } }],
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          captain: "captain-b",
          status: "accepted",
        }),
      }),
      { new: true },
    );
    expect(accepted.ride.captain).toBe("captain-b");
  });

  test("allows only one winner when two acceptance attempts race", async () => {
    rideModel.findOneAndUpdate
      .mockReturnValueOnce(populatedQuery({
        _id: "ride-race",
        captain: "captain-a",
        status: "accepted",
      }))
      .mockReturnValueOnce(populatedQuery(null));
    rideModel.findById.mockReturnValue(populatedQuery({
      _id: "ride-race",
      captain: "captain-a",
      status: "accepted",
    }));

    const results = await Promise.allSettled([
      rideService.confirmRide({
        rideId: "ride-race",
        captain: { _id: "captain-a" },
      }),
      rideService.confirmRide({
        rideId: "ride-race",
        captain: { _id: "captain-b" },
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  test("creates a fresh OTP only when the captain arrives", async () => {
    rideModel.findOne.mockReturnValueOnce(populatedQuery({
      _id: "ride-arrive",
      captain: "captain-a",
      status: "accepted",
      user: { _id: "user-1" },
    }));
    rideModel.findOneAndUpdate.mockReturnValue(populatedQuery({
      _id: "ride-arrive",
      captain: "captain-a",
      status: "arrived",
    }));

    const result = await rideService.markArrived({
      rideId: "ride-arrive",
      captain: { _id: "captain-a" },
    });

    expect(result.otpPlain).toMatch(/^\d{6}$/);
    expect(rideModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "ride-arrive", captain: "captain-a", status: "accepted" },
      {
        $set: expect.objectContaining({
          status: "arrived",
          arrivedAt: expect.any(Date),
          otpHash: expect.any(String),
          otpCipher: expect.any(String),
          otpExpiresAt: expect.any(Date),
        }),
      },
      { new: true },
    );
  });

  test("adds only the rejecting captain to declinedBy", async () => {
    rideModel.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 });
    rideModel.findById.mockReturnValue(populatedQuery({
        _id: "ride-y",
        status: "searching",
        declinedBy: ["captain-a"],
    }));

    await rideService.rejectRide({
      rideId: "ride-y",
      captain: { _id: "captain-a" },
    });

    expect(rideModel.updateOne).toHaveBeenCalledWith(
      {
        _id: "ride-y",
        status: "searching",
        $or: [{ captain: null }, { captain: { $exists: false } }],
      },
      { $addToSet: { declinedBy: "captain-a" } },
    );
  });

  test("does not record a rejection after another captain accepts", async () => {
    rideModel.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 0 });
    rideModel.findById.mockReturnValue(populatedQuery({
      _id: "ride-y",
      status: "accepted",
      captain: "captain-b",
    }));

    await expect(
      rideService.rejectRide({
        rideId: "ride-y",
        captain: { _id: "captain-a" },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Ride already assigned or no longer available",
    });
  });

  test("clears a captain busy flag when the assigned ride is completed", async () => {
    rideModel.findOne
      .mockReturnValueOnce(populatedQuery({
        _id: "ride-complete",
        captain: "captain-z",
        status: "started",
        startedAt: "2025-01-01T00:00:00.000Z",
        user: { _id: "user-1" },
      }))
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      });
    rideModel.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 });
    rideModel.findById.mockReturnValue(populatedQuery({
      _id: "ride-complete",
      captain: "captain-z",
      status: "completed",
      user: { _id: "user-1" },
    }));
    captainModel.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 });

    await rideService.endRide({
      rideId: "ride-complete",
      captain: { _id: "captain-z" },
    });

    expect(rideModel.updateOne).toHaveBeenCalledWith(
      { _id: "ride-complete" },
      expect.objectContaining({ status: "completed" }),
    );
    expect(captainModel.updateOne).toHaveBeenCalledWith(
      { _id: "captain-z", busy: true },
      { $set: { busy: false } },
    );
  });
});