const crypto = require("crypto");
const { handleRazorpayWebhook } = require("../services/registrationPayment.service");

/** Body must be raw Buffer (mount with express.raw before express.json) */
module.exports.razorpayWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
      console.warn("RAZORPAY_WEBHOOK_SECRET not set");
      return res.status(501).json({
        message: "Webhook not configured",
      });
    }

    const sig = req.headers["x-razorpay-signature"];
    const body = req.body;

    if (!Buffer.isBuffer(body)) {
      return res.status(400).json({
        message: "Expected raw body",
      });
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    if (!sig || sig !== expected) {
      return res.status(400).json({
        message: "Invalid signature",
      });
    }

    let payload;

    try {
      payload = JSON.parse(body.toString("utf8"));
    } catch {
      return res.status(400).json({
        message: "Invalid JSON",
      });
    }

    const result = await handleRazorpayWebhook(
      payload.event,
      payload,
    );

    console.log("[Razorpay webhook]", payload.event, result.message || "handled");

    return res.status(200).json({
      received: true,
      ...result,
    });
  } catch (error) {
    console.error("[Razorpay webhook]", error);

    return res.status(error.statusCode || 500).json({
      received: false,
      message: error.message || "Webhook processing failed",
    });
  }
};