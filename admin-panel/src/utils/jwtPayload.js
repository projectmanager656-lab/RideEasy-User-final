/**
 * Decode JWT payload (browser-safe, no signature verification).
 * Used to assert `role` before treating a token as admin.
 */

export function parseJwtPayload (token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(base64)
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function jwtRole (token) {
  const p = parseJwtPayload(token)
  return p?.role ?? null
}

export function isAdminRoleToken (token) {
  return jwtRole(token) === 'admin'
}
