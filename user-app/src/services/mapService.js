/**
 * Map service — geocoding and address autocomplete for the passenger app.
 * All calls go through the shared apiClient; screens never hit the API directly.
 */
import { apiClient, withAuth } from './apiClient'

/** Autocomplete suggestions for a partial address input. */
export function getSuggestions (input, city) {
  return apiClient.get('/maps/get-suggestions', withAuth({ params: { input, city } }))
}

/** Resolve an address string to { lat, lng }. */
export function getCoordinates (address) {
  return apiClient.get('/maps/get-coordinates', withAuth({ params: { address } }))
}