/**
 * Safety preferences for the RideEasy Safety screen.
 *
 * Emergency contacts are NOT here: they are stored server-side via
 * `/users/emergency-contact` (collection `emergency_contacts`) and read/written by
 * Safety.jsx and EmergencyContact.jsx directly.
 *
 * The toggles are persisted server-side via `/users/safety-prefs`; localStorage is kept
 * only as an instant cache so the section can render before the request resolves.
 */

import { apiClient, withAuth } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'

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

/** Load the saved toggles from the backend and refresh the local cache. */
export async function fetchSafetyPrefs () {
  const res = await apiClient.get('/users/safety-prefs', withAuth())
  const prefs = stripApiEnvelope(res.data)?.safetyPrefs
  if (prefs && typeof prefs === 'object') {
    safeSet(PREFS_KEY, prefs)
    return { ...DEFAULT_SAFETY_PREFS, ...prefs }
  }
  return getSafetyPrefs()
}

/** Persist one toggle server-side, then refresh the local cache. */
export async function updateSafetyPref (key, value) {
  const res = await apiClient.patch('/users/safety-prefs', { [key]: Boolean(value) }, withAuth())
  const prefs = stripApiEnvelope(res.data)?.safetyPrefs
  if (prefs && typeof prefs === 'object') {
    safeSet(PREFS_KEY, prefs)
    return { ...DEFAULT_SAFETY_PREFS, ...prefs }
  }
  const next = { ...getSafetyPrefs(), [key]: Boolean(value) }
  safeSet(PREFS_KEY, next)
  return next
}