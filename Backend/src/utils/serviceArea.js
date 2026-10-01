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
 * Every city name that gates driver↔ride matching, derived from the zone config so
 * the canonical spelling has exactly one source of truth.
 */
const SERVICE_CITY_NAMES = [ ...new Set(SERVICE_AREAS.map((z) => z.key)) ]

/**
 * Canonical comparison key for a city string: trimmed + lower-cased, so
 * "Ichalkaranji", "ichalkaranji" and " Ichalkaranji " all collapse to "ichalkaranji".
 * Different cities (Kolhapur, Sangli) keep different keys — cities are never conflated.
 * Returns null for a missing/blank value.
 */
function cityKey (value) {
  if (value == null) return null
  const key = String(value).trim().toLowerCase()
  return key || null
}

/**
 * Canonical spelling of a service city (e.g. "ichalkaranji" -> "Ichalkaranji"), or null
 * when the value is not a serviced city. Used on the write paths so the value stored on
 * the driver is always the same one ride dispatch compares against.
 */
function canonicalServiceCity (value) {
  const key = cityKey(value)
  if (!key) return null
  return SERVICE_CITY_NAMES.find((name) => cityKey(name) === key) || null
}

/**
 * Mongo clause matching a captain whose `servingCity` is the same city as `rideCity`,
 * ignoring surrounding whitespace and letter case. Returns null when `rideCity` is blank
 * so callers skip city matching rather than matching every driver.
 */
function captainServingCityMatch (rideCity) {
  const key = cityKey(rideCity)
  if (!key) return null
  return {
    $expr: {
      $eq: [
        { $toLower: { $trim: { input: { $ifNull: [ '$servingCity', '' ] } } } },
        key,
      ],
    },
  }
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
  SERVICE_CITY_NAMES,
  haversineKm,
  zoneDistanceBreakdown,
  logServiceAreaDistances,
  isWithinServiceArea,
  inferServiceCityKey,
  inferServiceCityKeyOrNearest,
  cityKey,
  canonicalServiceCity,
  captainServingCityMatch,
  ridePickupInServiceArea,
  SERVICE_AREA_ERROR,
}
