const crypto = require("crypto");

jest.mock("../../services/registrationPayment.service", () => ({
  handleRazorpayWebhook: jest.fn(),
}));
jest.mock("../../services/payment.service", () => ({
  handleRazorpayRidePaymentWebhook: jest.fn(),
  reserveRazorpayWebhookEvent: jest.fn(),
  updateRazorpayWebhookEvent: jest.fn(),
}));

const { handleRazorpayWebhook } = require("../../services/registrationPayment.service");
const {
  handleRazorpayRidePaymentWebhook,
  reserveRazorpayWebhookEvent,
  updateRazorpayWebhookEvent,
} = require("../../services/payment.service");
const { razorpayWebhook } = require("../../controllers/webhooks.controller");

function response() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function request(payload, eventId = "evt-1") {
  const body = Buffer.from(JSON.stringify(payload));
  return {
    body,
    headers: {
      "x-razorpay-event-id": eventId,
      "x-razorpay-signature": crypto
        .createHmac("sha256", "webhook-secret")
        .update(body)
        .digest("hex"),
    },
  };
}

describe("Razorpay webhook controller event idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAZORPAY_WEBHOOK_SECRET = "webhook-secret";
    reserveRazorpayWebhookEvent.mockResolvedValue({
      tracked: true,
      acquired: true,
      status: "processing",
      reservationToken: "reservation-token",
    });
    updateRazorpayWebhookEvent.mockResolvedValue({ acknowledged: true });
    handleRazorpayWebhook.mockResolvedValue({ handled: true, message: "registration handled" });
    handleRazorpayRidePaymentWebhook.mockResolvedValue({ handled: true, message: "ride handled" });
  });

  test("reserves and completes the first event", async () => {
    const res = response();
    await razorpayWebhook(
      request({ event: "payment.captured", payload: { payment: { entity: {} } } }),
      res,
    );

    expect(reserveRazorpayWebhookEvent).toHaveBeenCalledWith({
      eventId: "evt-1",
      event: "payment.captured",
      paymentId: undefined,
      orderId: undefined,
    });
    expect(updateRazorpayWebhookEvent).toHaveBeenCalledWith(
      "evt-1",
      "reservation-token",
      "processed",
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("does not run business processing for a processed duplicate", async () => {
    reserveRazorpayWebhookEvent.mockResolvedValue({
      tracked: true,
      acquired: false,
      status: "processed",
    });
    const res = response();

    await razorpayWebhook(request({ event: "payment.captured" }), res);

    expect(handleRazorpayWebhook).not.toHaveBeenCalled();
    expect(handleRazorpayRidePaymentWebhook).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ alreadyProcessed: true }));
  });

  test("does not run business processing for an in-progress duplicate", async () => {
    reserveRazorpayWebhookEvent.mockResolvedValue({
      tracked: true,
      acquired: false,
      status: "processing",
    });
    const res = response();

    await razorpayWebhook(request({ event: "payment.captured" }), res);

    expect(handleRazorpayWebhook).not.toHaveBeenCalled();
    expect(handleRazorpayRidePaymentWebhook).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ alreadyProcessing: true }));
  });

  test("marks a failed business attempt retryable and preserves the original error", async () => {
    const error = new Error("payment service unavailable");
    handleRazorpayWebhook.mockRejectedValue(error);
    const res = response();

    await razorpayWebhook(request({ event: "payment.captured" }), res);

    expect(updateRazorpayWebhookEvent).toHaveBeenCalledWith(
      "evt-1",
      "reservation-token",
      "failed",
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ received: false, message: error.message }),
    );
  });

  test("retries a failed event and processes it successfully later", async () => {
    const error = new Error("temporary payment failure");
    reserveRazorpayWebhookEvent
      .mockResolvedValueOnce({
        tracked: true,
        acquired: true,
        status: "processing",
        reservationToken: "first-token",
      })
      .mockResolvedValueOnce({
        tracked: true,
        acquired: true,
        status: "processing",
        reservationToken: "retry-token",
      });
    handleRazorpayWebhook
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ handled: true, message: "retry succeeded" });

    const firstResponse = response();
    await razorpayWebhook(request({ event: "payment.captured" }), firstResponse);
    const secondResponse = response();
    await razorpayWebhook(request({ event: "payment.captured" }), secondResponse);

    expect(updateRazorpayWebhookEvent).toHaveBeenNthCalledWith(
      1,
      "evt-1",
      "first-token",
      "failed",
    );
    expect(updateRazorpayWebhookEvent).toHaveBeenNthCalledWith(
      2,
      "evt-1",
      "retry-token",
      "processed",
    );
    expect(handleRazorpayWebhook).toHaveBeenCalledTimes(2);
  });

  test("allows only one concurrent duplicate to run business processing", async () => {
    reserveRazorpayWebhookEvent
      .mockResolvedValueOnce({
        tracked: true,
        acquired: true,
        status: "processing",
        reservationToken: "owner-token",
      })
      .mockResolvedValueOnce({
        tracked: true,
        acquired: false,
        status: "processing",
      });
    const firstResponse = response();
    const secondResponse = response();

    await Promise.all([
      razorpayWebhook(request({ event: "payment.captured" }), firstResponse),
      razorpayWebhook(request({ event: "payment.captured" }), secondResponse),
    ]);

    expect(handleRazorpayWebhook).toHaveBeenCalledTimes(1);
    expect(handleRazorpayRidePaymentWebhook).not.toHaveBeenCalled();
  });

  test("preserves registration webhook dispatch", async () => {
    const res = response();
    await razorpayWebhook(request({ event: "payment.captured" }), res);

    expect(handleRazorpayWebhook).toHaveBeenCalledWith(
      "payment.captured",
      expect.any(Object),
      "evt-1",
    );
    expect(handleRazorpayRidePaymentWebhook).not.toHaveBeenCalled();
  });

  test.each(["payment.captured", "order.paid"])(
    "dispatches a valid ride %s event after registration handler declines it",
    async (event) => {
      handleRazorpayWebhook.mockResolvedValue({ handled: false, message: "not registration" });
      const res = response();

      await razorpayWebhook(
        request({
          event,
          payload: {
            payment: {
              entity: {
                id: "pay-1",
                order_id: "order-1",
                notes: { rideId: "ride-1", paymentType: "ride_approach_payment" },
              },
            },
          },
        }),
        res,
      );

      expect(handleRazorpayRidePaymentWebhook).toHaveBeenCalledWith(
        event,
        expect.any(Object),
        "evt-1",
      );
      expect(res.status).toHaveBeenCalledWith(200);
    },
  );

  test("rejects an invalid webhook signature before business processing", async () => {
    const req = request({ event: "payment.captured" });
    req.headers["x-razorpay-signature"] = "invalid";
    const res = response();

    await razorpayWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid signature" });
    expect(reserveRazorpayWebhookEvent).not.toHaveBeenCalled();
    expect(handleRazorpayWebhook).not.toHaveBeenCalled();
  });

  test("processes missing event IDs without persistence for backward compatibility", async () => {
    const res = response();
    await razorpayWebhook(request({ event: "payment.captured" }, ""), res);

    expect(reserveRazorpayWebhookEvent).not.toHaveBeenCalled();
    expect(updateRazorpayWebhookEvent).not.toHaveBeenCalled();
    expect(handleRazorpayWebhook).toHaveBeenCalledWith(
      "payment.captured",
      expect.any(Object),
      undefined,
    );
  });
});
