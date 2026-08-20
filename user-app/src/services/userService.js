/**
 * User service — profile and onboarding APIs for the passenger app.
 * All calls go through the shared apiClient; screens never hit the API directly.
 */
import { apiClient, withAuth } from './apiClient'

/** Fetch the authenticated passenger's profile. */
export function getProfile (config = {}) {
  return apiClient.get('/users/profile', withAuth(config))
}

/** Update name / saved addresses on the passenger's profile. */
export function updateProfile (patch) {
  return apiClient.patch('/users/profile', patch, withAuth())
}

/** Best-effort server-side onboarding marker for this device. */
export function completeOnboarding (deviceId) {
  return apiClient.post('/users/onboarding/complete', { deviceId })
}

/** Read the server-side onboarding state for this device. */
export function getOnboardingStatus (deviceId) {
  return apiClient.get('/users/onboarding/status', { params: { deviceId } })
}