const { SERVICE_AREAS } = require('../config/serviceAreas')

const SERVICE_AREA_ERROR = 'Service not available in this area'

/** Earth radius in km */
const R = 6371

function toRad (deg) {
  return (deg * Math.PI) / 180
}

/**
 * Haversine distance between two WGS84 points (km).
 */
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

/**
 * Haversine distance from (lat,lng) to each zone center + whether inside that zone's radius.
 * @param {number} lat
 * @param {number} lng
 * @returns {{ key: string, name: string, radiusKm: number, distanceKm: number, inside: boolean }[]}
 */
function zoneDistanceBreakdown (lat, lng) {
  return SERVICE_AREAS.map((z) => {
    const distanceKm = haversineKm(lat, lng, z.lat, z.lng)
    return {
      key: z.key,
      name: z.name,
      radiusKm: z.radius,
      distanceKm: Math.round(distanceKm * 1000) / 1000,
      inside: distanceKm <= z.radius,
    }
  })
}

/**
 * True if (lat,lng) lies within at least one service circle (OR across zones).
 */
function isWithinServiceArea (lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  return SERVICE_AREAS.some((z) => haversineKm(lat, lng, z.lat, z.lng) <= z.radius)
}

/**
 * Log Haversine distances to each zone (e.g. when pickup/drop validation fails).
 * @param {string} label - 'pickup' | 'drop' | etc.
 * @param {number} lat
 * @param {number} lng
 */
function logServiceAreaDistances (label, lat, lng) {
  const rows = zoneDistanceBreakdown(lat, lng)
  const best = rows.reduce((a, r) => (r.distanceKm < a.distanceKm ? r : a), rows[0])
  console.warn('[serviceArea]', label, {
    lat,
    lng,
    allowed: rows.some((r) => r.inside),
    closestZone: best?.key,
    closestKm: best?.distanceKm,
    zones: rows,
  })
}

/**
 * Captain / ride `city` string for DB matching — closest circle center among zones that contain the point.
 */
function inferServiceCityKey (lat, lng) {
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

/**
 * When pickup is outside all radii (e.g. map-selected edge), still assign a `city` for driver matching — nearest zone center by Haversine.
 */
function inferServiceCityKeyOrNearest (lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const inside = inferServiceCityKey(lat, lng)
  if (inside) return inside
  let bestKey = SERVICE_AREAS[0]?.key ?? 'Kolhapur'
  let bestDist = Infinity
  for (const z of SERVICE_AREAS) {
    const d = haversineKm(lat, lng, z.lat, z.lng)
    if (d < bestDist) {
      bestDist = d
      bestKey = z.key
    }
  }
  return bestKey
}

/**
 * Pickup coordinates on a ride doc: GeoJSON [lng, lat].
 */
function ridePickupInServiceArea (ride) {
  const c = ride?.pickup?.coordinates
  if (!Array.isArray(c) || c.length < 2) return false
  const [ lng, lat ] = c
  return isWithinServiceArea(lat, lng)
}

module.exports = {
  SERVICE_AREAS,
  haversineKm,
  zoneDistanceBreakdown,
  logServiceAreaDistances,
  isWithinServiceArea,
  inferServiceCityKey,
  inferServiceCityKeyOrNearest,
  ridePickupInServiceArea,
  SERVICE_AREA_ERROR,
}
