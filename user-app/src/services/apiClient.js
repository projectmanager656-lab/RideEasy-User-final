import axios from 'axios'
import { getApiBaseUrl } from '../config/apiBaseUrl'
import { getPassengerToken, getCaptainToken, getAdminToken } from '../utils/authTokens'

/**
 * Single axios instance for the deployed (or local) backend.
 * Set VITE_BASE_URL in .env — full URL, no trailing slash.
 */
export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_MS || 30000),
  headers: { 'Content-Type': 'application/json' },
})

// Development diagnostics: the single resolved API origin every request uses.
if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_LOGS === 'true') {
  console.info('[API] Base URL:', apiClient.defaults.baseURL)
}

export function requestPath (config) {
  const url = config.url || ''
  if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url)
      return u.pathname + u.search
    } catch {
      return url
    }
  }
  return url.startsWith('/') ? url : `/${url}`
}

/** Clear session on expired/invalid JWT (all authed API calls use Bearer token). */
apiClient.interceptors.response.use(
  (res) => {
    if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_LOGS === 'true') {
      const cfg = res.config
      const method = String(cfg?.method || 'get').toUpperCase()
      const url = cfg?.url || ''
      console.info(`[API Response] ${method} ${url} -> HTTP ${res.status}`)
    }
    return res
  },
  (err) => {
    const status = err.response?.status
    const cfg = err.config
    const method = String(cfg?.method || 'get').toLowerCase()
    const path = requestPath(cfg || {})

    if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_LOGS === 'true') {
      console.warn(`[API Error] ${method.toUpperCase()} ${cfg?.url || ''} -> HTTP ${status || 'NETWORK_ERR'}:`, {
        code: err.code,
        message: err.message,
        serverMessage: err.response?.data?.message || err.response?.data?.error,
      })
    }

    const isAuthPublic =
      (method === 'post' && /^\/users\/(login|register)/i.test(path))
      || (method === 'get' && /^\/users\/logout/i.test(path))
    if (
      import.meta.env.VITE_APP_ROLE === 'user'
      && status === 401
      && !isAuthPublic
    ) {
      try {
        localStorage.removeItem('token')
      } catch {
        /* ignore */
      }
      const p = typeof window !== 'undefined' ? window.location.pathname : ''
      if (p !== '/login' && p !== '/signup') {
        window.location.replace('/login')
      }
    }
    return Promise.reject(err)
  }
)

/** Passenger app: users, rides, maps, health only (no captain/admin namespaces). */
const PASSENGER_ALLOWED = [
  /^\/users(\/|$)/i,
  /^\/rides(\/|$)/i,
  /^\/maps(\/|$)/i,
  /^\/health(\/|$)/i,
  /^\/support-tickets(\/|$)/i,
  /^\/chat(\/|$)/i,
]

apiClient.interceptors.request.use((config) => {
  if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_LOGS === 'true') {
    const fullUrl = config.baseURL ? `${config.baseURL.replace(/\/$/, '')}/${String(config.url || '').replace(/^\//, '')}` : config.url
    console.info(`[API Request] ${String(config.method || 'get').toUpperCase()} ${fullUrl}`, {
      baseURL: config.baseURL,
      path: config.url,
    })
  }

  if (import.meta.env.VITE_APP_ROLE !== 'user') return config
  const path = requestPath(config)
  if (!PASSENGER_ALLOWED.some((re) => re.test(path))) {
    return Promise.reject(new Error(`[Passenger app] This endpoint is not used here: ${path}`))
  }
  return config
})

function bearerHeaders (token, config = {}) {
  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }
}

/** Passenger JWT (`token` in localStorage). */
export function withAuth (config = {}) {
  return bearerHeaders(getPassengerToken(), config)
}

/** Captain JWT (`captainToken` or legacy `captain-token`). */
export function withCaptainAuth (config = {}) {
  return bearerHeaders(getCaptainToken(), config)
}

/** Maps & shared endpoints: passenger app **or** driver app (whichever is logged in). */
export function withUserOrCaptainAuth (config = {}) {
  const token = getPassengerToken() || getCaptainToken()
  return bearerHeaders(token, config)
}

/** Admin JWT (`adminToken`). */
export function withAdminAuth (config = {}) {
  return bearerHeaders(getAdminToken(), config)
}
