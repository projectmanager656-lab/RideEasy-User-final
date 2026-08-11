import axios from 'axios'
import { getApiBaseUrl } from '../config/apiBaseUrl'
import { getAdminToken } from '../utils/authTokens'
import { stripApiEnvelope } from '../utils/apiBody'
import { isAdminRoleToken } from '../utils/jwtPayload'
import { normalizeListResponse } from '../admin/adminUtils'

const client = axios.create({
  baseURL: getApiBaseUrl().replace(/\/$/, ''),
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_MS || 30000),
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  const url = String(config.url || '')
  if (url.includes('/admin/login')) return config

  const token = getAdminToken()
  if (!token || !isAdminRoleToken(token)) {
    return Promise.reject(new Error('Admin session required — JWT role must be admin'))
  }
  config.headers = {
    ...config.headers,
    Authorization: `Bearer ${token}`,
  }
  return config
})

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      try {
        localStorage.removeItem('adminToken')
      } catch { /* ignore */ }
      const path = window.location.pathname || '/admin'
      const loginPath = path.replace(/\/admin\/.*$/i, '/admin') || '/admin'
      window.location.assign(`${window.location.origin}${loginPath}`)
    }
    return Promise.reject(err)
  }
)

function unwrap (data) {
  return stripApiEnvelope(data)
}

export const adminApi = {
  getAnalytics (signal) {
    return client.get('/admin/analytics', { signal }).then((r) => unwrap(r.data))
  },

  getUsers (signal) {
    return client.get('/admin/users', { signal }).then((r) => normalizeListResponse(unwrap(r.data), 'users'))
  },

  getDrivers (signal) {
    return client.get('/admin/drivers', { signal }).then((r) => normalizeListResponse(unwrap(r.data), 'drivers'))
  },

  getRides (rideStatusFilter, signal) {
    const q = rideStatusFilter && rideStatusFilter !== 'all'
      ? `?status=${encodeURIComponent(rideStatusFilter)}`
      : ''
    return client.get(`/admin/rides${q}`, { signal }).then((r) => normalizeListResponse(unwrap(r.data), 'rides'))
  },

  getPayments (signal) {
    return client.get('/admin/payments', { signal }).then((r) => normalizeListResponse(unwrap(r.data), 'payments'))
  },

  getPricing (signal) {
    return client.get('/admin/pricing', { signal }).then((r) => unwrap(r.data))
  },

  putPricing (payload) {
    return client.put('/admin/pricing', payload).then((r) => unwrap(r.data))
  },

  approveDriver (id) {
    return client.put(`/admin/drivers/${id}/approve`, {}).then((r) => unwrap(r.data))
  },

  rejectDriver (id) {
    return client.put(`/admin/drivers/${id}/reject`, {}).then((r) => unwrap(r.data))
  },

  patchUserBlock (id, blocked) {
    return client.patch(`/admin/users/${id}/block`, { blocked }).then((r) => unwrap(r.data))
  },

  patchDriverBlock (id, blocked) {
    return client.patch(`/admin/drivers/${id}/block`, { blocked }).then((r) => unwrap(r.data))
  },

  deleteUser (id) {
    return client.delete(`/admin/users/${id}`).then((r) => unwrap(r.data))
  },

  deleteDriver (id) {
    return client.delete(`/admin/drivers/${id}`).then((r) => unwrap(r.data))
  },

  deleteRide (id) {
    return client.delete(`/admin/rides/${id}`).then((r) => unwrap(r.data))
  },
}
