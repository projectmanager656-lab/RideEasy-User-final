/**
 * Cancellation must free the coupon reservation for the ride.
 * `coupon.service` is mocked here so we can assert the controller calls the existing
 * `releaseCoupon` helper (the real helper's behaviour is covered by
 * `coupon.stale-release.test.js` and the live end-to-end run).
 */

jest.mock("../../services/pricing.service", () => ({
    getCaptainPricing: jest.fn(),
}));
jest.mock("../../services/rideCore.service", () => ({
    normalizeVehicleType: jest.fn((value) => value),
    releaseCaptainBusyIfAvailable: jest.fn(),
}));
jest.mock("../../services/coupon.service", () => ({
    validateCoupon: jest.fn(),
    reserveCoupon: jest.fn(),
    releaseCoupon: jest.fn(),
    releaseStaleCouponReservations: jest.fn(),
    settleCouponRedemption: jest.fn(),
}));
jest.mock("../../models/captain.model", () => ({
    findById: jest.fn(),
    updateOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
}));
jest.mock("../../models/rideCore.model", () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findById: jest.fn(),
    updateOne: jest.fn(),
}));
jest.mock("../../services/payment.service", () => ({}));
jest.mock("../../services/maps.service", () => ({}));
jest.mock("../../socket", () => ({
    emitToUser: jest.fn(),
    emitToCaptain: jest.fn(),
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

const captainModel = require("../../models/captain.model");
const rideModel = require("../../models/rideCore.model");
const rideService = require("../../services/rideCore.service");
const couponService = require("../../services/coupon.service");
const rideController = require("../../controllers/ride.controller");

function responseFor() {
    const response = {};
    response.set = jest.fn();
    response.status = jest.fn(() => response);
    response.json = jest.fn((body) => body);
    return response;
}

/** `rideModel.findById(id).populate("user").populate("captain")` -> resolves to `ride` */
function populatedRideChain(ride) {
    return {
        populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(ride),
        }),
    };
}

describe("ride cancellation releases the coupon reservation", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("TEST 5a: passenger cancel releases the coupon reserved for the ride", async () => {
        const ride = {
            _id: "ride-1",
            status: "searching",
            user: { _id: "user-1" },
            captain: null,
            couponCode: "RIDE100",
        };
        rideModel.findById.mockReturnValue(populatedRideChain(ride));
        rideModel.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 });

        const response = responseFor();
        await rideController.cancelRideByUser(
            { params: { id: "ride-1" }, user: { _id: "user-1" }, body: {} },
            response,
        );

        expect(rideModel.updateOne).toHaveBeenCalledWith(
            { _id: "ride-1" },
            { $set: expect.objectContaining({ status: "cancelled", cancelledBy: "user" }) },
        );
        expect(couponService.releaseCoupon).toHaveBeenCalledWith({ rideId: "ride-1" });
        expect(rideService.releaseCaptainBusyIfAvailable).toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(200);
    });

    test("TEST 5b: driver cancel releases the coupon reserved for the ride", async () => {
        const ride = {
            _id: "ride-2",
            status: "arrived",
            user: { _id: "user-1" },
            captain: { _id: "captain-1" },
            couponCode: "RIDE100",
        };
        rideModel.findById.mockReturnValue(populatedRideChain(ride));
        rideModel.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 });
        captainModel.findById.mockReturnValue({
            select: jest.fn().mockResolvedValue({ driverCancelCount: 0, blocked: false }),
        });
        captainModel.updateOne.mockResolvedValue({ acknowledged: true });

        const response = responseFor();
        await rideController.cancelRideByCaptain(
            { params: { id: "ride-2" }, captain: { _id: "captain-1" }, body: {} },
            response,
        );

        expect(couponService.releaseCoupon).toHaveBeenCalledWith({ rideId: "ride-2" });
        expect(response.status).toHaveBeenCalledWith(200);
    });

    test("cancel is not allowed at a non-cancellable stage and does not touch the coupon", async () => {
        const ride = {
            _id: "ride-3",
            status: "started",
            user: { _id: "user-1" },
            captain: { _id: "captain-1" },
        };
        rideModel.findById.mockReturnValue(populatedRideChain(ride));

        const response = responseFor();
        await rideController.cancelRideByUser(
            { params: { id: "ride-3" }, user: { _id: "user-1" }, body: {} },
            response,
        );

        expect(couponService.releaseCoupon).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(409);
    });
});
