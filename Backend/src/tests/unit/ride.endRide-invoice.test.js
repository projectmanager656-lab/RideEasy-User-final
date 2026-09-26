/**
 * Completing a ride must persist an invoice snapshot.
 *
 * Previously `getOrCreateInvoice` was only reachable from GET /rides/:id/invoice, so a
 * completed ride had no row in `invoices` until somebody opened the invoice screen.
 */

jest.mock("../../services/pricing.service", () => ({
    getCaptainPricing: jest.fn(),
}));
jest.mock("../../services/rideCore.service", () => ({
    normalizeVehicleType: jest.fn((value) => value),
    releaseCaptainBusyIfAvailable: jest.fn(),
    endRide: jest.fn(),
}));
jest.mock("../../services/coupon.service", () => ({
    validateCoupon: jest.fn(),
    reserveCoupon: jest.fn(),
    releaseCoupon: jest.fn(),
    releaseStaleCouponReservations: jest.fn(),
    settleCouponRedemption: jest.fn(),
}));
jest.mock("../../services/invoice.service", () => ({
    getOrCreateInvoice: jest.fn(),
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

const rideModel = require("../../models/rideCore.model");
const rideService = require("../../services/rideCore.service");
const invoiceService = require("../../services/invoice.service");
const rideController = require("../../controllers/ride.controller");

function responseFor() {
    const response = {};
    response.set = jest.fn();
    response.status = jest.fn(() => response);
    response.json = jest.fn((body) => body);
    return response;
}

function completedRide() {
    return {
        _id: "ride-1",
        user: { _id: "user-1", name: "Asha" },
        captain: { _id: "captain-1", name: "Ravi", vehicleType: "AUTO", vehicleNumber: "MH09AB1234" },
        status: "completed",
        city: "Kolhapur",
        price: 100,
        chargedAmount: 95,
        discountAmount: 5,
        pickupLocation: "Central Bus Stand",
        dropLocation: "Railway Station",
        vehicleType: "AUTO",
        paymentMethod: "Cash",
    };
}

describe("endRide persists the invoice snapshot", () => {
    let ride;

    beforeEach(() => {
        jest.clearAllMocks();
        ride = completedRide();
        rideService.endRide.mockResolvedValue(ride);
        rideModel.findById.mockReturnValue({
            populate: jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue(ride),
            }),
        });
        invoiceService.getOrCreateInvoice.mockResolvedValue({ invoiceNumber: "INV-TEST-1" });
    });

    test("stores an invoice for the completed ride", async () => {
        const response = responseFor();

        await rideController.endRide(
            { body: { rideId: "ride-1" }, captain: { _id: "captain-1" } },
            response,
        );

        expect(invoiceService.getOrCreateInvoice).toHaveBeenCalledTimes(1);
        expect(invoiceService.getOrCreateInvoice.mock.calls[0][0]).toMatchObject({ _id: "ride-1" });
        expect(response.status).toHaveBeenCalledWith(200);
    });

    test("an invoice failure still completes the ride", async () => {
        invoiceService.getOrCreateInvoice.mockRejectedValue(new Error("invoice write blew up"));
        const response = responseFor();

        await rideController.endRide(
            { body: { rideId: "ride-1" }, captain: { _id: "captain-1" } },
            response,
        );

        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, message: "Ride completed" }));
    });
});
