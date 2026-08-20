/**
 * Payment service — payment creation/verification for rides.
 * All calls go through the shared apiClient; screens never hit the API directly.
 */
import { apiClient, withAuth } from './apiClient'

/** Mock/development payment — marks the ride paid with the chosen method. */
export function payMock (rideId, method) {
  return apiClient.post('/rides/pay-mock', { rideId, method }, withAuth())
}

/** Verify a UPI intent after the passenger completes a UPI payment. */
export function verifyUpiIntent (payload) {
  return apiClient.post('/rides/upi/verify', payload, withAuth())
}