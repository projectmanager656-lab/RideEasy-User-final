/**
 * ONE source of truth for the passenger's "active ride" pointer and for deciding
 * whether a stored ride id may still drive the live-tracking UI.
 *
 * The pointer is only a HINT: it is never proof that a ride is active. A ride is
 * treated as live-tracking-worthy only when the backend confirms a genuinely active
 * status (`searching` / `accepted` / `arrived`) that has NOT run past the search
 * window. Finished, failed or stale rides must clear the pointer and leave tracking.
 */

/** Session key written by the booking flow and read by the restore paths. */
export const RIDE_SESSION_KEY = 'rideeasy_user_ride'

/** Same window the tracking screen uses before it declares "No Driver Found". */
export const RIDE_SEARCH_TIMEOUT_SECONDS = 120

const ACTIVE_STATUSES = new Set([ 'searching', 'accepted', 'arrived' ])
const FINAL_STATUSES = new Set([ 'cancelled', 'completed', 'failed', 'rejected', 'expired' ])

export function normalizeRideStatus (status) {
  return String(status || '').trim().toLowerCase()
}

export function readRideSessionId () {
  try {
    return sessionStorage.getItem(RIDE_SESSION_KEY) || null
  } catch {
    return null
  }
}

export function writeRideSessionId (id) {
  if (id == null || id === '') return
  try {
    sessionStorage.setItem(RIDE_SESSION_KEY, String(id))
  } catch {
    /* ignore */
  }
}

export function clearRideSession () {
  try {
    sessionStorage.removeItem(RIDE_SESSION_KEY)
  } catch {
    /* ignore */
  }
}

/** A status the tracking screen can still legitimately show. */
export function isRideStatusActive (status) {
  return ACTIVE_STATUSES.has(normalizeRideStatus(status))
}

/** A status that ends the ride — tracking must not survive it. */
export function isRideStatusFinal (status) {
  return FINAL_STATUSES.has(normalizeRideStatus(status))
}

/** Seconds since the search actually began (dispatch), else row creation. Null when unknown. */
export function rideSearchAgeSeconds (ride, now = Date.now()) {
  const raw = ride?.searchStartedAt || ride?.createdAt
  const ms = raw ? new Date(raw).getTime() : NaN
  if (!Number.isFinite(ms)) return null
  return Math.max(0, (now - ms) / 1000)
}

/** A `searching` ride older than the search window is a dead search — never restore it. */
export function isRideSearchExpired (ride, now = Date.now()) {
  if (normalizeRideStatus(ride?.status) !== 'searching') return false
  const age = rideSearchAgeSeconds(ride, now)
  return age != null && age >= RIDE_SEARCH_TIMEOUT_SECONDS
}

/**
 * The ONLY definition of "this ride is worth restoring the tracking screen for".
 * Requires a backend-confirmed active status that has not expired.
 */
export function isRideGenuinelyActive (ride, now = Date.now()) {
  if (!ride?._id) return false
  if (isRideStatusFinal(ride.status)) return false
  if (isRideSearchExpired(ride, now)) return false
  return isRideStatusActive(ride.status)
}
