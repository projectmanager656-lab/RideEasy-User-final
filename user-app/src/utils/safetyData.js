/**
 * Safety preferences for the RideEasy Safety screen.
 *
 * Emergency contacts are NOT here: they are stored server-side via
 * `/users/emergency-contact` (collection `emergency_contacts`) and read/written by
 * Safety.jsx and EmergencyContact.jsx directly.
 *
 * The toggles below still have no backend endpoint, so they stay device-local.
 */

const PREFS_KEY = 'rideeasy_safety_prefs'

export const DEFAULT_SAFETY_PREFS = {
  shareTripAutomatically: false,
  shareLiveLocation: true,
  safetyNotifications: true,
}

function safeGet (key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function safeSet (key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* ignore */ }
}

/** @returns {{ shareTripAutomatically: boolean, shareLiveLocation: boolean, safetyNotifications: boolean } } */
export function getSafetyPrefs () {
  const stored = safeGet(PREFS_KEY, {})
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_SAFETY_PREFS }
  return { ...DEFAULT_SAFETY_PREFS, ...stored }
}

export function setSafetyPref (key, value) {
  const next = { ...getSafetyPrefs(), [key]: Boolean(value) }
  safeSet(PREFS_KEY, next)
  return next
}