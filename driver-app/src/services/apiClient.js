import axios from 'axios'
import { getPassengerToken, getCaptainToken, getAdminToken } from '../utils/authTokens'
import { getApiBaseUrl } from '../config/apiBaseUrl'

/**
 * Driver app — axios allowed only for `/captains` and `/rides`.
 * Use {@link ./driverBackendFetch.js} for `/maps`, `/driver-subscriptions`, `/health`.
 */
export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_MS || 30000),
  headers: { 'Content-Type': 'application/json' },
})

function requestPath (config) {
  const url = config.url || ''
  if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url)
      return u.pathname + u.search
    } catch {
      return url
    }
  }
  let p = url.startsWith('/') ? url : `/${url}`
  if (p.startsWith('/api')) {
    p = p.replace(/^\/api/, '') || '/'
    if (!p.startsWith('/')) p = `/${p}`
  }
  return p
}

const ALLOW_PREFIXES = [ /^\/captains(\/|$)/i, /^\/rides(\/|$)/i ]

function isBlockedPath (path) {
  return /^\/users(\/|$)/i.test(path) || /^\/admin(\/|$)/i.test(path)
}

function isAllowedPath (path) {
  return ALLOW_PREFIXES.some((re) => re.test(path))
}

apiClient.interceptors.request.use((config) => {
  const path = requestPath(config)
  if (isBlockedPath(path)) {
    return Promise.reject(Object.assign(new Error(`[Driver app] Blocked API: ${path}`), { code: 'DRIVER_API_BLOCKED', config }))
  }
  if (!isAllowedPath(path)) {
    return Promise.reject(Object.assign(new Error(`[Driver app] Unsupported API path: ${path}`), { code: 'DRIVER_API_UNSUPPORTED', config }))
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

export function withAuth (config = {}) {
  return bearerHeaders(getPassengerToken(), config)
}

export function withCaptainAuth (config = {}) {
  return bearerHeaders(getCaptainToken(), config)
}

export function withAdminAuth (config = {}) {
  return bearerHeaders(getAdminToken(), config)
}

export function withUserOrCaptainAuth (config = {}) {
  const token = getPassengerToken() || getCaptainToken()
  return bearerHeaders(token, config)
}
