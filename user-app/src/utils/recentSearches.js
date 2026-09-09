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

function entryOf (item) {
    const pickup = String(item.pickup || '').trim()
    const destination = String(item.destination || item.name || '').trim()
    const detail = String(item.detail || '').trim()
    return { pickup, destination, name: destination, detail, at: Number(item.at) || Date.now() }
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
            .filter((item) => item.destination)
            .slice(0, MAX_RECENT)
    } catch {
        return []
    }
}

export function addRecentSearch ({ pickup = '', destination = '', name = '', detail = '' }) {
    const pick = String(pickup || '').trim()
    const drop = String(destination || name || '').trim()
    if (!drop) return
    try {
        const entry = entryOf({ pickup: pick, destination: drop, detail })
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