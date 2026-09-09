/**
 * Must match `backend/src/config/serviceAreas.js`.
 */
const SERVICE_AREAS = [
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

function toRad (deg) {
  return (deg * Math.PI) / 180
}

function haversineKm (lat1, lng1, lat2, lng2) {
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

/**
 * When GPS is unavailable, use a sensible map center for the captain’s city so
 * `driver:join` + DB location stay in the right region for ride matching.
 */
export function fallbackCoordsForCaptainCity (city) {
  const c = String(city || '').trim()
  const z = SERVICE_AREAS.find((a) => a.key.toLowerCase() === c.toLowerCase())
  if (z) return { lat: z.lat, lng: z.lng }
  return { lat: SERVICE_AREAS[0].lat, lng: SERVICE_AREAS[0].lng }
}

export function ridePickupInServiceArea (ride) {
  const c = ride?.pickup?.coordinates
  if (!Array.isArray(c) || c.length < 2) return false
  const [ lng, lat ] = c
  return isWithinServiceArea(lat, lng)
}
