const express = require('express')
const { body } = require('express-validator')
const auth = require('../middlewares/auth.middleware')
const controller = require('../controllers/driverSubscriptions.controller')

const router = express.Router()

// Public: show plan prices (frontend uses it to render UI)
router.get('/plans', controller.getPlans)

// Captain-only: check current subscription
router.get('/my-status', auth.authCaptain, controller.getMyStatus)

// Captain-only: activate / renew subscription (amounts from DB pricing; payment gateway can be wired later)
router.post(
  '/create',
  auth.authCaptain,
  body('plan').optional().isIn(['weekly', 'monthly', 'yearly']),
  body('paymentMode').optional().isString(),
  controller.createSubscription
)

module.exports = router

