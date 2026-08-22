/**
 * Recent searches for the pre-home Location screen.
 * Persisted in localStorage — no backend dependency needed, works offline.
 */

const RECENT_SEARCHES_KEY = 'rideeasy_recent_searches'
const MAX_RECENT = 8

export function getRecentSearches () {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY)
    const list = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) return []
    return list
      .filter((item) => item && typeof item.name === 'string' && item.name.trim())
      .slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

export function addRecentSearch ({ name, detail = '' }) {
  const cleanName = String(name || '').trim()
  if (!cleanName) return
  const cleanDetail = String(detail || '').trim()
  try {
    const list = getRecentSearches()
    const next = [
      { name: cleanName, detail: cleanDetail, at: Date.now() },
      ...list.filter((item) => String(item.name || '').trim().toLowerCase() !== cleanName.toLowerCase()),
    ].slice(0, MAX_RECENT)
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next))
    return next
  } catch {
    /* ignore */
  }
}
