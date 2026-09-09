import { API_BASE_URL } from '../config/apiBaseUrl'

/**
 * Human-readable message from axios error (validation, network, 401, CORS, etc.)
 */
export function formatApiError (error) {
  if (!error?.response) {
    const msg = error?.message || ''
    const refused =
      error?.code === 'ECONNREFUSED' ||
      /ECONNREFUSED|connection refused/i.test(msg)
    if (msg.includes('Network Error') || error?.code === 'ERR_NETWORK' || refused) {
      const hint = refused
        ? ' Nothing is listening (start the API: from repo root run `npm run dev:backend` or `npm run dev:all`).'
        : ''
      return `Cannot reach the API at ${API_BASE_URL}. Set VITE_BASE_URL or VITE_API_BASE_URL to your API origin, check CORS, and that the backend is running.${hint}`
    }
    if (error?.code === 'ECONNABORTED' || msg.toLowerCase().includes('timeout')) {
      return 'Request timed out. Check your connection and try again.'
    }
    return msg || `Network error. Confirm VITE_BASE_URL points to your backend (${API_BASE_URL}).`
  }

  const { status, data } = error.response

  if (status === 401) {
    const m = typeof data === 'object' && data && typeof data.message === 'string' ? data.message : ''
    return m || 'Session expired or invalid credentials. Please sign in again.'
  }
  if (status === 403) {
    const m = typeof data === 'object' && data && typeof data.message === 'string' ? data.message : ''
    return m || 'You do not have permission to do this.'
  }
  if (status === 404) {
    const m = typeof data === 'object' && data && typeof data.message === 'string' ? data.message : ''
    return m || 'API endpoint not found. Check VITE_BASE_URL matches your deployed backend.'
  }
  if (status >= 500) {
    const m = typeof data === 'object' && data && typeof data.message === 'string' ? data.message : ''
    return m || 'Server error. Please try again later.'
  }

  let base = 'Request failed'
  if (typeof data === 'string' && data.trim()) {
    const snippet = data.trim().slice(0, 200)
    base = snippet
  } else if (typeof data === 'object' && data && typeof data.message === 'string') {
    base = data.message
  } else if (status) {
    base = `Request failed (${status})`
  }

  const errs = typeof data === 'object' && data ? data.errors : null
  if (Array.isArray(errs) && errs.length > 0) {
    const lines = errs.map((e) => {
      if (typeof e === 'string') return e
      const path = e.path || e.param || e.location || ''
      const m = e.msg || e.message || ''
      return path ? `${path}: ${m}` : m
    }).filter(Boolean)
    if (lines.length) return `${base}\n\n${lines.join('\n')}`
  }

  return base
}
