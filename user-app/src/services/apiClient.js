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

/**
 * Centralized 401/session-expiry handling.
 * A single handler can be registered (e.g. UserContext) to clear in-memory
 * auth state; the hard redirect to /login is the fallback when no handler is
 * registered. Screens must NOT implement their own 401 logic.
 */
let unauthorizedHandler = null

export function setUnauthorizedHandler (handler) {
  unauthorizedHandler = typeof handler === 'function' ? handler : null
}

/** Role of the request based on the Authorization header actually attached. */
function requestRole (config) {
  const auth = String(config?.headers?.Authorization || '')
  const cap = getCaptainToken()
  const adm = getAdminToken()
  if (cap && auth === `Bearer ${cap}`) return 'captain'
  if (adm && auth === `Bearer ${adm}`) return 'admin'
  return 'passenger'
}

function redirectTo (path, current) {
  const p = typeof window !== 'undefined' ? window.location.pathname : ''
  if (p !== path && p !== current) {
    window.location.replace(path)
  }
}

function redirectToLogin () {
  redirectTo('/login', '/welcome')
}

/** Clear the given role's stored JWT (keys match utils/authTokens). */
function clearRoleSession (role) {
  try {
    if (role === 'captain') {
      localStorage.removeItem('captainToken')
      localStorage.removeItem('captain-token')
    } else if (role === 'admin') {
      localStorage.removeItem('adminToken')
    } else {
      localStorage.removeItem('token')
    }
  } catch {
    /* ignore */
  }
}

/** Clear session on expired/invalid JWT (all authed API calls use Bearer token). */
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status
    const cfg = err.config
    const method = String(cfg?.method || 'get').toLowerCase()
    const path = requestPath(cfg || {})
    const isAuthPublic =
      (method === 'post'
        && /^\/(users\/(login|register)|captains\/(login|register|phone\/send-otp|phone\/verify-otp)|admin\/login)/i.test(path))
      || (method === 'get' && /^\/users\/logout/i.test(path))
    if (
      import.meta.env.VITE_APP_ROLE === 'user'
      && status === 401
      && !isAuthPublic
    ) {
      const role = requestRole(cfg || {})
      if (role === 'captain') {
        clearRoleSession('captain')
        redirectTo('/captain-login')
      } else if (role === 'admin') {
        clearRoleSession('admin')
        redirectTo('/admin')
      } else if (unauthorizedHandler) {
        unauthorizedHandler()
      } else {
        clearRoleSession('passenger')
        redirectToLogin()
      }
    }
    return Promise.reject(err)
  }
)

/** Namespace allowlists per role (mirror of the backend route prefixes). */
const ROLE_ALLOWED = {
  passenger: [ /^\/users(\/|$)/i, /^\/rides(\/|$)/i, /^\/maps(\/|$)/i, /^\/health(\/|$)/i ],
  captain: [ /^\/captains(\/|$)/i, /^\/rides(\/|$)/i, /^\/maps(\/|$)/i, /^\/driver-subscriptions(\/|$)/i, /^\/health(\/|$)/i ],
  admin: [ /^\/admin(\/|$)/i ],
}

apiClient.interceptors.request.use((config) => {
  if (import.meta.env.VITE_APP_ROLE !== 'user') return config
  const path = requestPath(config)
  /* Public captain/admin calls carry no token → infer role from the namespace. */
  const role = requestRole(config) === 'passenger'
    ? (ROLE_ALLOWED.captain.some((re) => re.test(path)) ? 'captain'
      : (ROLE_ALLOWED.admin.some((re) => re.test(path)) ? 'admin' : 'passenger'))
    : requestRole(config)
  if (!ROLE_ALLOWED[role].some((re) => re.test(path))) {
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
