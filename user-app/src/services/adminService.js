import { apiClient, withAdminAuth } from './apiClient'
import { stripApiEnvelope } from '../utils/apiBody'

/**
 * Admin API — one function per backend endpoint.
 * All calls attach the admin JWT via withAdminAuth(); 401s are handled
 * centrally by the apiClient interceptors (session cleared, redirected to /admin).
 */

/** GET /admin/analytics — dashboard numbers. */
export function getAdminAnalytics () {
  return apiClient.get('/admin/analytics', withAdminAuth()).then((r) => stripApiEnvelope(r.data))
}

/** GET /admin/users — all users. */
export function getAdminUsers () {
  return apiClient.get('/admin/users', withAdminAuth()).then((r) => stripApiEnvelope(r.data))
}

/** GET /admin/drivers — all captains. */
export function getAdminDrivers () {
  return apiClient.get('/admin/drivers', withAdminAuth()).then((r) => stripApiEnvelope(r.data))
}

/** GET /admin/rides?status= — ride list, optionally filtered by status. */
export function getAdminRides (statusFilter) {
  const q = statusFilter && statusFilter !== 'all' ? `?status=${encodeURIComponent(statusFilter)}` : ''
  return apiClient.get(`/admin/rides${q}`, withAdminAuth()).then((r) => stripApiEnvelope(r.data))
}

/** GET /admin/payments — payments list. */
export function getAdminPayments () {
  return apiClient.get('/admin/payments', withAdminAuth()).then((r) => stripApiEnvelope(r.data))
}

/** GET /admin/pricing — pricing config. */
export function getAdminPricing () {
  return apiClient.get('/admin/pricing', withAdminAuth()).then((r) => stripApiEnvelope(r.data))
}

/** PUT /admin/pricing — update pricing config. */
export function putAdminPricing (payload) {
  return apiClient.put('/admin/pricing', payload, withAdminAuth()).then((r) => stripApiEnvelope(r.data))
}

/** PUT /admin/drivers/:id/approve — approve a driver. */
export function approveDriver (id) {
  return apiClient.put(`/admin/drivers/${id}/approve`, {}, withAdminAuth()).then((r) => stripApiEnvelope(r.data))
}

/** PUT /admin/drivers/:id/reject — reject a driver. */
export function rejectDriver (id) {
  return apiClient.put(`/admin/drivers/${id}/reject`, {}, withAdminAuth()).then((r) => stripApiEnvelope(r.data))
}

/** PATCH /admin/users/:id/block — block/unblock a user. */
export function blockUser (id, blocked) {
  return apiClient.patch(`/admin/users/${id}/block`, { blocked }, withAdminAuth()).then((r) => stripApiEnvelope(r.data))
}

/** PATCH /admin/drivers/:id/block — block/unblock a driver. */
export function blockDriver (id, blocked) {
  return apiClient.patch(`/admin/drivers/${id}/block`, { blocked }, withAdminAuth()).then((r) => stripApiEnvelope(r.data))
}