const { validationResult } = require('express-validator')
const captainModel = require('../models/captain.model')
const CaptainOnboarding = require('../models/captainOnboarding.model')
const SubscriptionRecord = require('../models/subscriptionRecord.model')
const PaymentRecord = require('../models/paymentRecord.model')
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
