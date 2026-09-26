const { validationResult } = require('express-validator')
const captainModel = require('../models/captain.model')
const CaptainOnboarding = require('../models/captainOnboarding.model')
const SubscriptionRecord = require('../models/subscriptionRecord.model')
const PaymentRecord = require('../models/paymentRecord.model')
const crypto = require('crypto')
const Razorpay = require('razorpay')
const { expiresAfterPlan, syncSubscriptionState, buildExpiryReminders } = require('../services/subscriptionDriver.service')
const pricingService = require('../services/pricing.service')

function normalizeVehicleTier(vt) {
  const up = String(vt || '').trim().toUpperCase()
  if (up === 'MINI' || up === 'SEDAN') return 'CAR'
  return up
}

module.exports.getPlans = async (req, res) => {
  try {
    const plans = await pricingService.getDriverPlansMerged()
    return res.status(200).json({ plans })
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: err.message || 'Could not load plans',
      requestId: req.requestId,
    })
  }
}

module.exports.getMyStatus = async (req, res) => {
  let captain = await captainModel.findById(req.captain._id)
  captain = await syncSubscriptionState(captain)

  const now = new Date()
  const exp = captain?.subscriptionExpiresAt
  const notExpired = !exp || new Date(exp) > now
  const active = captain?.subscriptionStatus === 'active' && notExpired

  const msRemaining = active && exp ? Math.max(0, new Date(exp).getTime() - now.getTime()) : 0
  const reminders = buildExpiryReminders(captain)

  return res.status(200).json({
    active,
    reminders,
    subscription: captain?.subscriptionStatus === 'none'
      ? null
      : {
          status: captain.subscriptionStatus,
          plan: captain.subscriptionPlan || null,
          startedAt: captain.subscriptionStartedAt || null,
          expiresAt: exp || null,
          expiresInMs: msRemaining,
          updatedAt: captain.updatedAt,
        },
  })
}

module.exports.createSubscription = async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      ok: false,
      message: 'Validation failed',
      errors: errors.array(),
      requestId: req.requestId,
    })
  }

  const plan = [ 'weekly', 'monthly', 'yearly' ].includes(req.body?.plan) ? req.body.plan : 'weekly'
  const captain = await captainModel.findById(req.captain._id)
  if (!captain) {
    return res.status(404).json({
      ok: false,
      message: 'Driver not found',
      requestId: req.requestId,
    })
  }
  const plans = await pricingService.getDriverPlansMerged()
  const onboarding = await CaptainOnboarding.findOne({ captainId: req.captain._id })
  const tier = normalizeVehicleTier(onboarding?.vehicleInformation?.vehicleType)
  const tierPlans = plans?.[tier]
  if (!tierPlans) {
    return res.status(400).json({
      ok: false,
      message: `No subscription plan configured for vehicle type ${tier || 'UNKNOWN'}`,
      requestId: req.requestId,
    })
  }
  if (!Number.isFinite(Number(tierPlans[plan])) || Number(tierPlans[plan]) <= 0) {
    return res.status(400).json({
      ok: false,
      message: `Invalid ${plan} subscription amount for ${tier}`,
      requestId: req.requestId,
    })
  }

  const now = new Date()
  const base = captain.subscriptionExpiresAt && new Date(captain.subscriptionExpiresAt) > now
    ? new Date(captain.subscriptionExpiresAt)
    : now

  const subscriptionExpiresAt = expiresAfterPlan(plan, base)
  const subscriptionStartedAt = captain.subscriptionStartedAt || now

  await captainModel.findByIdAndUpdate(req.captain._id, {
    subscriptionStatus: 'active',
    subscriptionPlan: plan,
    subscriptionStartedAt,
    subscriptionExpiresAt,
  })

  const amt = Number(tierPlans[plan])
  try {
    await SubscriptionRecord.create({
      driverId: req.captain._id,
      vehicleType: tier,
      planType: plan,
      amount: amt,
      startDate: subscriptionStartedAt,
      expiryDate: subscriptionExpiresAt,
      status: 'active',
    })
    await PaymentRecord.create({
      driverId: req.captain._id,
      amount: amt,
      paymentMode: 'PLAN',
      paymentStatus: 'success',
      paymentType: 'driver_subscription',
    })
  } catch (e) {
    console.warn('[driverSubscriptions] ledger record:', e?.message || e)
  }

  const fresh = await captainModel.findById(req.captain._id)
  return res.status(200).json({
    active: true,
    subscription: {
      status: fresh.subscriptionStatus,
      plan: fresh.subscriptionPlan,
      startedAt: fresh.subscriptionStartedAt,
      expiresAt: fresh.subscriptionExpiresAt,
      expiresInMs: Math.max(0, new Date(fresh.subscriptionExpiresAt).getTime() - Date.now()),
    },
  })
}

module.exports.createSubscriptionOrder = async (req, res) => {
  try {
    const plan = ['weekly', 'monthly', 'yearly'].includes(req.body?.plan) ? req.body.plan : 'weekly'
    const captain = await captainModel.findById(req.captain._id)
    if (!captain) return res.status(404).json({ ok: false, message: 'Driver not found' })

    const plans = await pricingService.getDriverPlansMerged()
    const onboarding = await CaptainOnboarding.findOne({ captainId: req.captain._id })
    const tier = normalizeVehicleTier(onboarding?.vehicleInformation?.vehicleType || captain.vehicleType)
    const tierPlans = plans?.[tier]
    if (!tierPlans || !tierPlans[plan]) {
      return res.status(400).json({ ok: false, message: `No subscription plan found for ${tier}` })
    }

    const amount = Number(tierPlans[plan])
    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder'
    const keySecret = process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_placeholder'

    let orderId = `sub_order_${Date.now()}_${String(captain._id).slice(-4)}`
    try {
      const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret })
      const order = await rzp.orders.create({
        amount: Math.round(amount * 100),
        currency: 'INR',
        receipt: `sub_${String(captain._id).slice(-6)}_${Date.now()}`,
        notes: {
          captainId: String(captain._id),
          paymentType: 'driver_subscription',
          plan,
          tier,
        },
      })
      orderId = order.id
    } catch (e) {
      console.warn('[createSubscriptionOrder] provider warning:', e?.message)
    }

    return res.status(200).json({
      ok: true,
      orderId,
      amount,
      plan,
      tier,
      currency: 'INR',
      keyId,
    })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || 'Failed to create subscription order' })
  }
}

module.exports.verifySubscriptionPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, plan = 'weekly' } = req.body || {}
    const captain = await captainModel.findById(req.captain._id)
    if (!captain) return res.status(404).json({ ok: false, message: 'Driver not found' })

    const secret = process.env.RAZORPAY_KEY_SECRET
    if (secret && razorpayOrderId && razorpaySignature) {
      const expected = crypto.createHmac('sha256', secret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex')
      if (expected !== razorpaySignature) {
        return res.status(400).json({ ok: false, message: 'Invalid payment signature' })
      }
    }

    const plans = await pricingService.getDriverPlansMerged()
    const onboarding = await CaptainOnboarding.findOne({ captainId: req.captain._id })
    const tier = normalizeVehicleTier(onboarding?.vehicleInformation?.vehicleType || captain.vehicleType)
    const amt = Number(plans?.[tier]?.[plan] || 99)

    const now = new Date()
    const base = captain.subscriptionExpiresAt && new Date(captain.subscriptionExpiresAt) > now
      ? new Date(captain.subscriptionExpiresAt)
      : now

    const subscriptionExpiresAt = expiresAfterPlan(plan, base)
    const subscriptionStartedAt = captain.subscriptionStartedAt || now

    await captainModel.findByIdAndUpdate(req.captain._id, {
      subscriptionStatus: 'active',
      subscriptionPlan: plan,
      subscriptionStartedAt,
      subscriptionExpiresAt,
    })

    await SubscriptionRecord.create({
      driverId: req.captain._id,
      vehicleType: tier,
      planType: plan,
      amount: amt,
      startDate: subscriptionStartedAt,
      expiryDate: subscriptionExpiresAt,
      status: 'active',
    })

    await PaymentRecord.create({
      driverId: req.captain._id,
      amount: amt,
      paymentMode: 'Online',
      paymentStatus: 'success',
      paymentType: 'driver_subscription',
      externalRef: razorpayPaymentId || `sub_${Date.now()}`,
    })

    const fresh = await captainModel.findById(req.captain._id)
    return res.status(200).json({
      ok: true,
      active: true,
      subscription: {
        status: fresh.subscriptionStatus,
        plan: fresh.subscriptionPlan,
        startedAt: fresh.subscriptionStartedAt,
        expiresAt: fresh.subscriptionExpiresAt,
        expiresInMs: Math.max(0, new Date(fresh.subscriptionExpiresAt).getTime() - Date.now()),
      },
    })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || 'Payment verification failed' })
  }
}
