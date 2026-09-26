/**
 * Recent searches for the pre-home Location screen and the Home "Book a ride" card.
 * Persisted per account in localStorage and mirrored to the backend, which keeps the
 * authoritative per-user record (`recent_searches.userId`).
 *
 * The local cache is scoped by the authenticated passenger's id (read from the session
 * JWT), so one account can never read another account's history — even on a shared
 * device or right after an account switch. With no valid session there is no scope and
 * nothing is shown.
 *
 * Each entry can be a pickup/drop pair (`{ pickup, destination }`) or a legacy
 * single destination (`{ name, detail }`). The `name` field is kept in sync
 * with `destination` so older consumers that read `item.name` keep working.
 */
import { API_BASE_URL } from '../config/apiBaseUrl'
import { getPassengerToken } from './authTokens'

const RECENT_SEARCHES_KEY_PREFIX = 'rideeasy_recent_searches_'
/**
 * Pre-scoping key. Its owner cannot be established any more, so it is dropped rather
 * than attributed to whoever happens to be signed in next.
 */
const LEGACY_RECENT_SEARCHES_KEY = 'rideeasy_recent_searches'
const MAX_RECENT = 8

/** Authenticated passenger id from the session JWT (`{ _id }` claim), else ''. */
function currentUserId() {
    try {
        if (typeof atob !== 'function') return ''
        const token = getPassengerToken()
        const payload = token ? String(token).split('.')[1] : ''
        if (!payload) return ''
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
        const claims = JSON.parse(atob(padded))
        return String(claims?._id || claims?.id || claims?.sub || '').trim()
    } catch {
        return ''
    }
}

/**
 * Storage key for the signed-in account — '' when signed out, and callers must then
 * read/write nothing rather than fall back to a shared key. Also performs the one-time
 * removal of the legacy global cache.
 */
function scopedKey() {
    try {
        localStorage.removeItem(LEGACY_RECENT_SEARCHES_KEY)
    } catch { /* ignore */ }
    const id = currentUserId()
    return id ? `${RECENT_SEARCHES_KEY_PREFIX}${id}` : ''
}

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
        const storageKey = scopedKey()
        if (!storageKey) return []
        const raw = localStorage.getItem(storageKey)
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
        const storageKey = scopedKey()
        /** Signed out (or unscoped session): never write to a shared bucket. */
        if (!storageKey) return
        const entry = entryOf(params)
        if (!entry) return
        const list = getRecentSearches()
        const key = dedupeKey(entry)
        const next = [
            entry,
            ...list.filter((item) => dedupeKey(item) !== key),
        ].slice(0, MAX_RECENT)
        localStorage.setItem(storageKey, JSON.stringify(next))

        // Non-blocking sync to backend if authenticated
        const token = getPassengerToken()
        if (token && API_BASE_URL) {
            fetch(`${API_BASE_URL}/users/recent-searches`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    pickup: entry.pickup,
                    destination: entry.destination,
                    pickupCoords: entry.pickupCoords,
                    dropCoords: entry.dropCoords
                })
            }).catch(() => {})
        }

        return next
    } catch {
        /* ignore */
    }
}

/**
 * Server list for the authenticated rider — the authoritative record. The response is
 * applied to this account's cache as-is (an empty list clears it, it never falls back
 * to whatever a previous account left behind). On a network/lookup failure the rider
 * sees only their own cached copy.
 */
export async function fetchBackendRecentSearches () {
    const storageKey = scopedKey()
    try {
        const token = getPassengerToken()
        if (!token || !storageKey || !API_BASE_URL) return getRecentSearches()
        const res = await fetch(`${API_BASE_URL}/users/recent-searches`, {
            headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok) return getRecentSearches()
        const data = await res.json().catch(() => null)
        const items = data?.data?.recentSearches || data?.recentSearches
        if (Array.isArray(items)) {
            const formatted = items.map(entryOf).filter(Boolean)
            localStorage.setItem(storageKey, JSON.stringify(formatted))
            return formatted
        }
    } catch {
        /* offline — fall through to this account's own cache */
    }
    return getRecentSearches()
}