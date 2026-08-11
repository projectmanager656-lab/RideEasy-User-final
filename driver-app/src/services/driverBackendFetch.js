import { getApiBaseUrl } from '../config/apiBaseUrl'
import { getCaptainToken } from '../utils/authTokens'

const EXTRA_PREFIXES = [ /^\/maps(\/|$)/i, /^\/driver-subscriptions(\/|$)/i, /^\/health(\/|$)/i ]

function normalizePath (path) {
  const p = path.startsWith('/') ? path : `/${path}`
  if (/^\/users(\/|$)/i.test(p) || /^\/admin(\/|$)/i.test(p)) {
    throw Object.assign(new Error(`[Driver app] Blocked API: ${p}`), { code: 'DRIVER_API_BLOCKED' })
  }
  if (!EXTRA_PREFIXES.some((re) => re.test(p))) {
    throw Object.assign(new Error(`[Driver app] Use apiClient for ${p}`), { code: 'DRIVER_FETCH_WRONG_CLIENT' })
  }
  return p
}

/**
 * Same-origin fetch for paths not covered by {@link ./apiClient.js} (maps, subscriptions, health).
 */
export async function driverBackendFetch (path, init = {}) {
  const p = normalizePath(path)
  const url = `${getApiBaseUrl()}${p}`
  const headers = new Headers(init.headers || {})
  const token = getCaptainToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (init.body != null && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(url, { ...init, headers })
}

export async function driverBackendJson (path, init = {}) {
  const res = await driverBackendFetch(path, init)
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && data.message) ? data.message : `HTTP ${res.status}`
    const err = Object.assign(new Error(msg), {
      response: { status: res.status, data },
    })
    throw err
  }
  return data
}
