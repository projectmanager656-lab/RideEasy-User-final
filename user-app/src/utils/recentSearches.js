/**
 * Recent searches for the pre-home Location screen and the Home "Book a ride" card.
 * Persisted in localStorage — no backend dependency needed, works offline.
 *
 * Each entry can be a pickup/drop pair (`{ pickup, destination }`) or a legacy
 * single destination (`{ name, detail }`). The `name` field is kept in sync
 * with `destination` so older consumers that read `item.name` keep working.
 */

const RECENT_SEARCHES_KEY = 'rideeasy_recent_searches'
const MAX_RECENT = 8

function extractLocationName(val) {
    if (!val) return ''
    if (typeof val === 'string') return val.trim()
    if (typeof val === 'object') {
        return String(val.name || val.address || val.formattedAddress || val.description || '').trim()
    }
    return String(val).trim()
}

function extractCoords(val, fallbackCoords) {
    if (fallbackCoords && Number.isFinite(Number(fallbackCoords.lat)) && Number.isFinite(Number(fallbackCoords.lng))) {
        return { lat: Number(fallbackCoords.lat), lng: Number(fallbackCoords.lng) }
    }
    if (val && typeof val === 'object') {
        const lat = val.latitude ?? val.lat
        const lng = val.longitude ?? val.lng
        if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
            return { lat: Number(lat), lng: Number(lng) }
        }
    }
    return null
}

function entryOf (item) {
    if (!item || typeof item !== 'object') return null
    const pickup = extractLocationName(item.pickup)
    const destination = extractLocationName(item.destination || item.drop || item.name)
    const detail = String(item.detail || (typeof item.drop === 'object' && item.drop?.detail) || '').trim()

    const pickupCoords = extractCoords(item.pickup, item.pickupCoords)
    const dropCoords = extractCoords(item.destination || item.drop, item.dropCoords)

    const pickupSelection = (typeof item.pickup === 'object' && item.pickup !== null)
        ? item.pickup
        : (item.pickupSelection || (pickupCoords ? { name: pickup, latitude: pickupCoords.lat, longitude: pickupCoords.lng } : null))

    const dropSelection = (typeof item.destination === 'object' && item.destination !== null)
        ? item.destination
        : (typeof item.drop === 'object' && item.drop !== null)
            ? item.drop
            : (item.dropSelection || (dropCoords ? { name: destination, latitude: dropCoords.lat, longitude: dropCoords.lng } : null))

    return {
        pickup,
        destination,
        name: destination,
        detail,
        pickupCoords,
        dropCoords,
        pickupSelection,
        dropSelection,
        at: Number(item.at) || Date.now()
    }
}

function dedupeKey (e) {
    return `${e.pickup}|${e.destination}`.toLowerCase()
}

export function getRecentSearches () {
    try {
        const raw = localStorage.getItem(RECENT_SEARCHES_KEY)
        const list = raw ? JSON.parse(raw) : []
        if (!Array.isArray(list)) return []
        return list
            .map(entryOf)
            .filter(Boolean)
            .filter((item) => item.destination || item.pickup)
            .slice(0, MAX_RECENT)
    } catch {
        return []
    }
}

export function addRecentSearch (params) {
    if (!params || typeof params !== 'object') return
    const pick = extractLocationName(params.pickup)
    const drop = extractLocationName(params.destination || params.name || params.drop)
    if (!drop && !pick) return

    try {
        const entry = entryOf(params)
        if (!entry) return
        const list = getRecentSearches()
        const key = dedupeKey(entry)
        const next = [
            entry,
            ...list.filter((item) => dedupeKey(item) !== key),
        ].slice(0, MAX_RECENT)
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next))
        return next
    } catch {
        /* ignore */
    }
}