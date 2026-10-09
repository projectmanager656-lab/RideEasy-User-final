/**
 * Location values arrive in two shapes:
 *   - a plain string, as stored on the ride documents ("Central Bus Stand")
 *   - a snapshot object, as stored on rating rows
 *     ({ address: 'Central Bus Stand', latitude: 16.7, longitude: 74.24 })
 *
 * Rendering an object directly produced "[object Object]". Always pass a location
 * through this helper before showing it.
 */
export function normalizeLocationText (value, fallback = '—') {
  if (value == null) return fallback

  if (typeof value === 'string') return value.trim() || fallback
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'object') return String(value)

  // Object shape: prefer the human-readable names, in order.
  const named = [ value.address, value.formattedAddress, value.name, value.label ]
  for (const candidate of named) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }

  // Last resort: the coordinates, tolerating both { latitude, longitude } and GeoJSON.
  const coordinates = Array.isArray(value.coordinates) ? value.coordinates : []
  const lat = Number(value.latitude ?? value.lat ?? coordinates[1])
  const lng = Number(value.longitude ?? value.lng ?? coordinates[0])
  if (Number.isFinite(lat) && Number.isFinite(lng)) return `${lat}, ${lng}`

  return fallback
}

export default normalizeLocationText
