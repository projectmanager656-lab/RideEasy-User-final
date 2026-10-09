const crypto = require("crypto");

jest.mock("razorpay", () => jest.fn());
jest.mock("../../models/rideCore.model", () => ({}));
jest.mock("../../models/captain.model", () => ({}));
jest.mock("../../models/paymentRecord.model", () => ({}));
jest.mock("../../models/razorpayWebhookEvent.model", () => ({
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../services/pricing.service", () => ({}));
jest.mock("../../services/maps.service", () => ({}));
jest.mock("../../utils/logger", () => ({ payment: jest.fn() }));

const RazorpayWebhookEvent = require("../../models/razorpayWebhookEvent.model");
const {
  reserveRazorpayWebhookEvent,
  updateRazorpayWebhookEvent,
} = require("../../services/payment.service");

describe("Razorpay webhook event idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(crypto, "randomUUID").mockReturnValue("reservation-token");
  });

  afterEach(() => {
    crypto.randomUUID.mockRestore();
  });

  test("atomically reserves the first event and marks it processed", async () => {
    RazorpayWebhookEvent.findOneAndUpdate.mockResolvedValue({
      eventId: "evt-1",
      status: "processing",
      reservationToken: "reservation-token",
    });

    const reservation = await reserveRazorpayWebhookEvent({
      eventId: "evt-1",
      event: "payment.captured",
      paymentId: "pay-1",
      orderId: "order-1",
    });

    expect(RazorpayWebhookEvent.findOneAndUpdate).toHaveBeenCalledWith(
      {
        eventId: "evt-1",
        $or: [{ status: "failed" }, { status: { $exists: false } }],
      },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "processing" }),
        $setOnInsert: { eventId: "evt-1" },
      }),
      { new: true, upsert: true },
    );
    expect(reservation).toMatchObject({
      tracked: true,
      acquired: true,
      status: "processing",
      reservationToken: "reservation-token",
    });

    await updateRazorpayWebhookEvent(
      "evt-1",
      reservation.reservationToken,
      "processed",
    );

    expect(RazorpayWebhookEvent.updateOne).toHaveBeenCalledWith(
      { eventId: "evt-1", reservationToken: "reservation-token" },
      {
        $set: {
          status: "processed",
          processedAt: expect.any(Date),
        },
      },
    );
  });

  test("does not acquire an already processed event", async () => {
    RazorpayWebhookEvent.findOneAndUpdate.mockRejectedValue({ code: 11000 });
    RazorpayWebhookEvent.findOne.mockResolvedValue({
      eventId: "evt-1",
      status: "processed",
      reservationToken: "old-token",
    });

    await expect(
      reserveRazorpayWebhookEvent({ eventId: "evt-1", event: "order.paid" }),
    ).resolves.toMatchObject({
      tracked: true,
      acquired: false,
      status: "processed",
    });
  });

  test("does not acquire an event already being processed", async () => {
    RazorpayWebhookEvent.findOneAndUpdate.mockRejectedValue({ code: 11000 });
    RazorpayWebhookEvent.findOne.mockResolvedValue({
      eventId: "evt-1",
      status: "processing",
      reservationToken: "other-token",
    });

    await expect(
      reserveRazorpayWebhookEvent({ eventId: "evt-1", event: "payment.captured" }),
    ).resolves.toMatchObject({
      tracked: true,
      acquired: false,
      status: "processing",
    });
  });

  test("allows a failed event to be reserved for retry", async () => {
    RazorpayWebhookEvent.findOneAndUpdate.mockResolvedValue({
      eventId: "evt-1",
      status: "processing",
      reservationToken: "reservation-token",
    });

    await expect(
      reserveRazorpayWebhookEvent({ eventId: "evt-1", event: "payment.captured" }),
    ).resolves.toMatchObject({ acquired: true, status: "processing" });
  });

  test("does not persist events without an event ID", async () => {
    await expect(
      reserveRazorpayWebhookEvent({ event: "payment.captured" }),
    ).resolves.toEqual({ tracked: false, acquired: true });
    expect(RazorpayWebhookEvent.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
