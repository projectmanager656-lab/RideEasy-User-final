/**
 * Placement of the searching-stage "nearby vehicle" markers.
 *
 * These are a purely visual searching indicator: the backend does not publish
 * nearby driver coordinates, so nothing here identifies a real driver or a ride.
 * Offsets are expressed in screen pixels around the pickup, which is what keeps
 * the ring readable at every zoom level instead of collapsing into one cluster.
 */

/** Vehicles drawn around the pickup while the passenger waits. */
const NEARBY_VEHICLE_COUNT = 5

/** Fallback ring radius (screen pixels) when the caller has no zoom to derive one from. */
const DEFAULT_NEARBY_RADIUS_PX = 56

/** The ring breathes between this share of its radius and the full radius. */
const MIN_RADIUS_FACTOR = 0.78

/**
 * Each vehicle owns an angular sector of the ring. The sector jitter stays well
 * inside half a sector and the wobble below is bounded, so two vehicles can
 * never share a bearing no matter how long the search runs.
 */
const SECTOR_JITTER_SHARE = 0.3
const MAX_WOBBLE_RAD = 0.06

/** Radians per second the whole ring turns — a calm drift, not a scramble. */
const RING_RATE_MIN = 0.06
const RING_RATE_MAX = 0.11

/** FNV-1a — stable hash, so one ride always shows the same neighbours. */
function hashString(str) {
    let h = 2166136261
    for (let i = 0; i < str.length; i += 1) {
        h ^= str.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    return h >>> 0
}

/** Deterministic value in [0, 1) for a labelled seed. */
function seededUnit(label) {
    return hashString(label) / 4294967296
}

const orbitCache = new Map()

/** Per-vehicle orbit parameters, derived once per ride seed. */
function orbitsFor(seed) {
    let entry = orbitCache.get(seed)
    if (entry) return entry
    const sector = (Math.PI * 2) / NEARBY_VEHICLE_COUNT
    entry = {
        /** Whole ring rotation: shared by every vehicle, so the gaps never change. */
        ringDirection: seededUnit(`${seed}:ring:dir`) < 0.5 ? 1 : -1,
        ringRate: RING_RATE_MIN + seededUnit(`${seed}:ring:rate`) * (RING_RATE_MAX - RING_RATE_MIN),
        vehicles: Array.from({ length: NEARBY_VEHICLE_COUNT }, (_, i) => ({
            baseAngle: i * sector + (seededUnit(`${seed}:${i}:a`) - 0.5) * sector * SECTOR_JITTER_SHARE,
            wobbleAmplitude: MAX_WOBBLE_RAD * (0.4 + 0.6 * seededUnit(`${seed}:${i}:w`)),
            wobbleRate: 0.25 + 0.35 * seededUnit(`${seed}:${i}:r`),
            wobblePhase: seededUnit(`${seed}:${i}:p`) * Math.PI * 2,
            breathRate: 0.08 + 0.08 * seededUnit(`${seed}:${i}:b`),
            breathPhase: seededUnit(`${seed}:${i}:q`) * Math.PI * 2,
        })),
    }
    orbitCache.set(seed, entry)
    return entry
}

/**
 * Pixel offsets (`dx` / `dy` from the pickup) of every nearby vehicle at
 * `elapsedSeconds` into the search, for a ring of `radiusPx`.
 *
 * Smooth by construction: the positions are a continuous function of the elapsed
 * time, so they can be sampled every animation frame without the markers ever
 * jumping to a new random spot.
 */
export function nearbyVehiclePoints(seed, elapsedSeconds, radiusPx) {
    const seedKey = String(seed ?? '')
    const seconds = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0
    const radius = Number.isFinite(radiusPx) && radiusPx > 0 ? radiusPx : DEFAULT_NEARBY_RADIUS_PX
    const { vehicles, ringDirection, ringRate } = orbitsFor(seedKey)
    const ring = ringDirection * ringRate * seconds

    return vehicles.map((orbit, i) => {
        const wobble = orbit.wobbleAmplitude * Math.sin(orbit.wobbleRate * seconds + orbit.wobblePhase)
        const angle = orbit.baseAngle + ring + wobble
        const breath = 0.5 + 0.5 * Math.sin(orbit.breathRate * seconds + orbit.breathPhase)
        const r = radius * (MIN_RADIUS_FACTOR + (1 - MIN_RADIUS_FACTOR) * breath)
        return { id: `nearby-${seedKey}-${i}`, dx: Math.cos(angle) * r, dy: Math.sin(angle) * r }
    })
}
