/**
 * Must match `backend/src/config/serviceAreas.js`.
 */
export const SERVICE_AREAS = [
  { key: 'Kolhapur', name: 'Kolhapur City', tier: 'core', lat: 16.705, lng: 74.243, radius: 22 },
  { key: 'Kolhapur', name: 'Uchgaon', tier: 'core', lat: 16.669, lng: 74.29, radius: 9 },
  { key: 'Kolhapur', name: 'Shiroli MIDC', tier: 'core', lat: 16.783, lng: 74.268, radius: 7 },
  { key: 'Kolhapur', name: 'Gokul Shirgaon', tier: 'core', lat: 16.734, lng: 74.288, radius: 8 },
  { key: 'Kolhapur', name: 'Kasaba Bawada', tier: 'core', lat: 16.694, lng: 74.23, radius: 6 },
  { key: 'Ichalkaranji', name: 'Ichalkaranji', tier: 'expansion', lat: 16.6917, lng: 74.4592, radius: 14 },
  { key: 'Ichalkaranji', name: 'Hupari', tier: 'expansion', lat: 16.739, lng: 74.385, radius: 10 },
  { key: 'Ichalkaranji', name: 'Rukadi', tier: 'expansion', lat: 16.64, lng: 74.356, radius: 9 },
  { key: 'Sangli', name: 'Sangli', tier: 'expansion', lat: 16.8524, lng: 74.5815, radius: 20 },
]

const R = 6371

export const SERVICE_AREA_USER_MESSAGE =
  'RideEasy serves Kolhapur region (core zones), Ichalkaranji belt (incl. Hupari & Rukadi), and Sangli. Pickup and drop must lie inside a covered area.'

export const SERVICE_AREA_API_MESSAGE = 'Service not available in this area'

function toRad (deg) {
  return (deg * Math.PI) / 180
}

export function haversineKm (lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
    * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function isWithinServiceArea (lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  return SERVICE_AREAS.some((z) => haversineKm(lat, lng, z.lat, z.lng) <= z.radius)
}

export function inferServiceCityKey (lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  let bestKey = null
  let bestDist = Infinity
  for (const z of SERVICE_AREAS) {
    const d = haversineKm(lat, lng, z.lat, z.lng)
    if (d <= z.radius && d < bestDist) {
      bestKey = z.key
      bestDist = d
    }
  }
  return bestKey
}

export function ridePickupInServiceArea (ride) {
  const c = ride?.pickup?.coordinates
  if (!Array.isArray(c) || c.length < 2) return false
  const [ lng, lat ] = c
  return isWithinServiceArea(lat, lng)
}
