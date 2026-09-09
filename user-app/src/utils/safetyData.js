/**
 * Safety data for the RideEasy Safety screen.
 *
 * Emergency contacts & safety toggles have no backend endpoint yet, so they are
 * persisted to localStorage under namespaced keys (mirrors recentSearches.js).
 * Swap these get/set functions for API calls once backend endpoints exist.
 */

const CONTACTS_KEY = 'rideeasy_emergency_contacts'
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

/** @returns {{ id: string, name: string, phone: string, relationship: string, primary: boolean }[] } */
export function getEmergencyContacts () {
  const list = safeGet(CONTACTS_KEY, [])
  return Array.isArray(list) ? list : []
}

export function saveEmergencyContacts (list) {
  safeSet(CONTACTS_KEY, Array.isArray(list) ? list : [])
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