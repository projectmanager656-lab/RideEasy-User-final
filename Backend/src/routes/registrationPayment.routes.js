const express = require("express");
const auth = require("../middlewares/auth.middleware");
const registrationPaymentController = require("../controllers/registrationPayment.controller");

const router = express.Router();

router.post(
  "/registration-payment",
  auth.authCaptain,
  registrationPaymentController.createRegistrationPayment,
);

router.get(
  "/registration-payment",
  auth.authCaptain,
  registrationPaymentController.getRegistrationPayment,
);

router.post(
  "/registration-payment/success",
  auth.authCaptain,
  registrationPaymentController.markRegistrationPaymentSuccess,
);

router.post(
  "/registration-payment/failed",
  auth.authCaptain,
  registrationPaymentController.markRegistrationPaymentFailed,
);

module.exports = router;
