import { apiClient, withCaptainAuth } from './apiClient'
import { stripApiEnvelope } from '../utils/apiBody'

/**
 * Captain (driver) API — one function per backend endpoint.
 * All authenticated calls attach the captain JWT via withCaptainAuth();
 * 401s are handled centrally by the apiClient interceptors (session cleared,
 * redirected to /captain-login).
 */

/** POST /captains/login — email + password. Returns { token, captain }. */
export function captainLogin (payload) {
  return apiClient.post('/captains/login', payload).then((r) => stripApiEnvelope(r.data))
}

/** POST /captains/register — full captain signup payload. */
export function captainRegister (payload) {
  return apiClient.post('/captains/register', payload).then((r) => stripApiEnvelope(r.data))
}

/** POST /captains/phone/send-otp — dev OTP comes back in the response body. */
export function captainSendPhoneOtp (phone) {
  return apiClient.post('/captains/phone/send-otp', { phone }).then((r) => stripApiEnvelope(r.data))
}

/** POST /captains/phone/verify-otp — returns { token, captain }. */
export function captainVerifyPhoneOtp (phone, otp) {
  return apiClient.post('/captains/phone/verify-otp', { phone, otp }).then((r) => stripApiEnvelope(r.data))
}

/** GET /captains/earnings — earnings summary for the logged-in captain. */
export function getCaptainEarnings () {
  return apiClient.get('/captains/earnings', withCaptainAuth()).then((r) => stripApiEnvelope(r.data))
}

/** GET /captains/rides/history — ride history for the logged-in captain. */
export function getCaptainRideHistory () {
  return apiClient.get('/captains/rides/history', withCaptainAuth()).then((r) => stripApiEnvelope(r.data))
}

/** POST /captains/status — toggle captain availability (`active` / `inactive`). */
export function updateCaptainStatus (status) {
  return apiClient.post('/captains/status', { status }, withCaptainAuth()).then((r) => stripApiEnvelope(r.data))
}

/** GET /driver-subscriptions/plans — public subscription plan list. */
export function getSubscriptionPlans () {
  return apiClient.get('/driver-subscriptions/plans').then((r) => stripApiEnvelope(r.data))
}

/** GET /driver-subscriptions/my-status — current subscription state. */
export function getMySubscriptionStatus () {
  return apiClient.get('/driver-subscriptions/my-status', withCaptainAuth()).then((r) => stripApiEnvelope(r.data))
}

/** POST /driver-subscriptions/create — create a subscription (payment). */
export function createSubscription (payload) {
  return apiClient.post('/driver-subscriptions/create', payload, withCaptainAuth()).then((r) => stripApiEnvelope(r.data))
}

/** GET /rides/pending — matching rides for this captain (polled). */
export function getPendingRides () {
  return apiClient.get('/rides/pending', withCaptainAuth({ params: { _ts: Date.now() } })).then((r) => r.data)
}

/** GET /rides/:id — single ride by id (captain scope). */
export function getRideById (id) {
  return apiClient.get(`/rides/${id}`, withCaptainAuth()).then((r) => stripApiEnvelope(r.data))
}

/** PATCH /rides/:id/accept — accept an assigned ride. */
export function acceptRide (id) {
  return apiClient.patch(`/rides/${id}/accept`, {}, withCaptainAuth()).then((r) => stripApiEnvelope(r.data))
}

/** PATCH /rides/:id/reject — reject an assigned ride. */
export function rejectRide (id) {
  return apiClient.patch(`/rides/${id}/reject`, {}, withCaptainAuth()).then((r) => stripApiEnvelope(r.data))
}

/** POST /rides/arrive — mark the accepted ride as arrived. */
export function arriveRide (rideId) {
  return apiClient.post('/rides/arrive', { rideId }, withCaptainAuth()).then((r) => stripApiEnvelope(r.data))
}

/** GET /rides/start-ride — start the ride with the passenger OTP. */
export function startRide (rideId, otp) {
  return apiClient.get('/rides/start-ride', withCaptainAuth({ params: { rideId, otp } })).then((r) => stripApiEnvelope(r.data))
}

/** POST /rides/end-ride — complete the ride and trigger payment. */
export function endRide (rideId) {
  return apiClient.post('/rides/end-ride', { rideId }, withCaptainAuth()).then((r) => stripApiEnvelope(r.data))
}

/** GET /maps/get-coordinates — geocode an address (captain scope). */
export function getCoordinates (address) {
  return apiClient.get('/maps/get-coordinates', withCaptainAuth({ params: { address } })).then((r) => stripApiEnvelope(r.data))
}