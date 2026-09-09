import { getOsrmPublicBase } from '../config/externalEndpoints'

/**
 * Public OSRM (same host as backend default). Browser-safe — avoids /maps/route when API returns 404
 * (stale deploy, CORS, etc.). Override with VITE_OSRM_URL if you self-host OSRM.
 */
const OSRM_BASE = getOsrmPublicBase()

/**
 * @returns {{ durationSec: number, distanceMeters: number, coordinates: [number, number][] }}
 * coordinates entries are [lat, lng] (matches backend maps controller).
 */
export async function fetchOsrmDrivingRoute (fromLng, fromLat, toLng, toLat, { overview = 'simplified' } = {}) {
  const lng1 = Number(fromLng)
  const lat1 = Number(fromLat)
  const lng2 = Number(toLng)
  const lat2 = Number(toLat)
  if (![ lng1, lat1, lng2, lat2 ].every(Number.isFinite)) {
    throw new Error('Invalid coordinates')
  }
  const ov = String(overview)
  const params = new URLSearchParams({ overview: ov, steps: 'false' })
  if (ov !== 'false') params.set('geometries', 'geojson')

  const url = `${OSRM_BASE}/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?${params.toString()}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`)
  const data = await res.json()
  const route = data?.routes?.[0]
  if (!route) throw new Error('No route')

  const out = {
    durationSec: route.duration,
    distanceMeters: route.distance,
    coordinates: [],
  }
  if (route.geometry?.coordinates?.length) {
    out.coordinates = route.geometry.coordinates.map(([ lng, lat ]) => [ lat, lng ])
  }
  return out
}
