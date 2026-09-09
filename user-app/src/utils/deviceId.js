/**
 * Stable per-browser/device identifier (generated once, kept in localStorage).
 * Used to persist onboarding state on the backend per device.
 */
const DEVICE_ID_KEY = 'rideeasy_device_id'

export const getDeviceId = () => {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (id) return id
    id =
      (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID())
      || `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(DEVICE_ID_KEY, id)
    return id
  } catch {
    return ''
  }
}
