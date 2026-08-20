/**
 * Fare service — fare estimates and distance/time lookups.
 * All calls go through the shared apiClient; screens never hit the API directly.
 */
import { apiClient, withAuth } from './apiClient'

/** Estimate fare for a trip (pickup/drop + coordinates → price per vehicle type). */
export function getFare (params) {
  return apiClient.get('/rides/get-fare', withAuth({ params }))
}

/** Distance/time estimate between two locations. */
export function getDistanceTime (params) {
  return apiClient.get('/maps/get-distance-time', withAuth({ params }))
}