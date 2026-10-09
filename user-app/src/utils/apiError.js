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
      // Distinct from a timeout: nothing answered at all.
      return `Unable to connect to the server at ${API_BASE_URL}. Check that the backend is running and that this device is on the same Wi-Fi network as it.`
    }
    if (error?.code === 'ECONNABORTED' || msg.toLowerCase().includes('timeout')) {
      // A physical phone that is not on the backend's network hangs until the
      // request times out, so name the URL and the likely cause.
      return `The server at ${API_BASE_URL} did not respond in time. On a phone this usually means it is not on the same Wi-Fi network as the backend, or the backend is not running.`
    }
    return msg || `Network error. Could not reach ${API_BASE_URL}.`
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
