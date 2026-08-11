import axios from 'axios'
import { getApiBaseUrl } from '../config/apiBaseUrl'
import { getPassengerToken, getCaptainToken, getAdminToken } from '../utils/authTokens'

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
  return url.startsWith('/') ? url : `/${url}`
}

apiClient.interceptors.request.use((config) => {
  if (import.meta.env.VITE_APP_ROLE !== 'admin') return config
  const path = requestPath(config)
  if (!/^\/admin(\/|$)/i.test(path)) {
    return Promise.reject(new Error(`[Admin console] Only /admin API paths are allowed: ${path}`))
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

export function withUserOrCaptainAuth (config = {}) {
  const token = getPassengerToken() || getCaptainToken()
  return bearerHeaders(token, config)
}

export function withAdminAuth (config = {}) {
  return bearerHeaders(getAdminToken(), config)
}
