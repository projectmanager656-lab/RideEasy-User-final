import { getPassengerToken } from './authTokens'

/**
 * Session cache for the Ride History payload (stale-while-revalidate).
 *
 * The history endpoint returns the rider's COMPLETE list (`limit=all`), so every
 * cold open pays a large transfer + JSON parse before anything can render. Keeping
 * the last successful response lets the page paint instantly on re-open while a
 * fresh copy is fetched in the background.
 *
 * sessionStorage (not localStorage) so a stale list never survives an app restart.
 * The entry is bound to the signed-in account via a hash of the JWT — never the
 * JWT itself — so an in-session account switch can never replay another rider's
 * history.
 */
const CACHE_KEY = 'rideeasy_ride_history_cache'
/** Never cache a payload big enough to be its own bottleneck. */
const MAX_BYTES = 1024 * 1024

/** Tiny non-cryptographic hash (djb2) used only as a cache-ownership tag. */
function tokenTag () {
  const token = getPassengerToken() || ''
  let hash = 5381
  for (let i = 0; i < token.length; i += 1) {
    hash = ((hash << 5) + hash + token.charCodeAt(i)) | 0
  }
  return String(hash)
}

/** Last cached `{ rides, counts }` for THIS account, or null. */
export function readRideHistoryCache () {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.rides)) return null
    if (parsed.tokenTag !== tokenTag()) return null
    return parsed
  } catch {
    return null
  }
}

/** Best-effort: skips silently when storage is unavailable or the payload is huge. */
export function writeRideHistoryCache (rides, counts) {
  try {
    const raw = JSON.stringify({ tokenTag: tokenTag(), rides, counts: counts || null })
    if (!raw || raw.length > MAX_BYTES) return
    sessionStorage.setItem(CACHE_KEY, raw)
  } catch {
    /* storage full / unavailable — the cache is an optimisation only */
  }
}
