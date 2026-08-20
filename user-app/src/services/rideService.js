/**
 * Ride service — booking, ride lifecycle, OTP, history, rating.
 * All calls go through the shared apiClient; screens never hit the API directly.
 */
import { apiClient, withAuth } from './apiClient'

/** Create a new ride booking (backend returns the ride doc). */
export function createRide (payload) {
  return apiClient.post('/rides/create', payload, withAuth())
}

/** Fetch the passenger's current active ride (used to recover state on restart). */
export function getActiveRide () {
  return apiClient.get('/rides/active', withAuth())
}

/** Fetch a single ride by id (status, captain, OTP, live location). */
export function getRide (rideId) {
  return apiClient.get(`/rides/${rideId}`, withAuth())
}

/** Fetch the passenger OTP for an accepted/arrived ride. */
export function getPassengerOtp (rideId) {
  return apiClient.get(`/rides/${rideId}/passenger-otp`, withAuth())
}

/** Cancel a ride by the passenger — real backend operation. */
export function cancelRide (rideId, reason = 'Cancelled by passenger') {
  return apiClient.patch(`/rides/${rideId}/cancel`, { reason }, withAuth())
}

/** Ask the backend to re-run captain assignment for a searching ride. */
export function retryAssign (rideId) {
  return apiClient.post(`/rides/${rideId}/retry-assign`, {}, withAuth())
}

/** Fetch the passenger's ride history. */
export function getRideHistory (limit = 50) {
  return apiClient.get('/rides/history', withAuth({ params: { limit } }))
}

/** Submit a passenger rating for a completed ride. */
export function rateRide (payload) {
  return apiClient.post('/rides/rate', payload, withAuth())
}