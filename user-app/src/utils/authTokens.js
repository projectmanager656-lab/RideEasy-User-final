/**
 * Single source for JWT keys used across User, Driver, and Admin panels.
 * Keeps localStorage key names consistent with `services/apiClient` helpers.
 */

export function getPassengerToken () {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem('token')
}

export function getCaptainToken () {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem('captainToken') || localStorage.getItem('captain-token')
}

export function getAdminToken () {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem('adminToken')
}
