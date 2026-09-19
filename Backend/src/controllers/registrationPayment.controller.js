const {
  createRegistrationPayment,
  markRegistrationPaymentSuccess,
  markRegistrationPaymentFailed,
  getLatestRegistrationPayment,
} = require("../services/registrationPayment.service");

function statusCode(error) {
  return error?.statusCode || 400;
}

/**
 * Captain starts the registration-fee payment.
 */
module.exports.createRegistrationPayment = async (req, res) => {
  try {
    const captainId = req.captain._id;

    const payment = await createRegistrationPayment(captainId);

    return res.status(201).json({
      success: true,
      ok: true,
      message: "Registration payment initiated",
      payment,
      requestId: req.requestId,
    });
  } catch (error) {
    return res.status(statusCode(error)).json({
      success: false,
      ok: false,
      message: error.message,
      ...(error.payment ? { payment: error.payment } : {}),
      requestId: req.requestId,
    });
  }
};

/**
 * Payment provider/webhook confirms successful registration-fee payment.
 */
module.exports.markRegistrationPaymentSuccess = async (req, res) => {
  try {
    const { paymentId, paymentMethod, transactionId } = req.body;

    if (!paymentId || !paymentMethod || !transactionId) {
      return res.status(400).json({
        success: false,
        ok: false,
        message: "paymentId, paymentMethod and transactionId are required",
        requestId: req.requestId,
      });
    }

    const payment = await markRegistrationPaymentSuccess(paymentId, {
      paymentMethod,
      transactionId,
    });

    return res.status(200).json({
      success: true,
      ok: true,
      message: "Registration payment recorded successfully",
      payment,
      requestId: req.requestId,
    });
  } catch (error) {
    return res.status(statusCode(error)).json({
      success: false,
      ok: false,
      message: error.message,
      requestId: req.requestId,
    });
  }
};

/**
 * Payment provider/webhook reports a failed registration-fee payment.
 */
module.exports.markRegistrationPaymentFailed = async (req, res) => {
  try {
    const { paymentId, failureReason } = req.body;

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        ok: false,
        message: "paymentId is required",
        requestId: req.requestId,
      });
    }

    const payment = await markRegistrationPaymentFailed(
      paymentId,
      failureReason,
    );

    return res.status(200).json({
      success: true,
      ok: true,
      message: "Registration payment marked as failed",
      payment,
      requestId: req.requestId,
    });
  } catch (error) {
    return res.status(statusCode(error)).json({
      success: false,
      ok: false,
      message: error.message,
      requestId: req.requestId,
    });
  }
};

/**
 * Captain checks the latest registration-fee payment.
 */
module.exports.getRegistrationPayment = async (req, res) => {
  try {
    const payment = await getLatestRegistrationPayment(req.captain._id);

    return res.status(200).json({
      success: true,
      ok: true,
      message: "Registration payment fetched successfully",
      payment,
      requestId: req.requestId,
    });
  } catch (error) {
    return res.status(statusCode(error)).json({
      success: false,
      ok: false,
      message: error.message,
      requestId: req.requestId,
    });
  }
};
