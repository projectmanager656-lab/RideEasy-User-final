/**
 * Public / third-party endpoints — set via VITE_* in .env (see frontend/.env.example).
 * Defaults preserve previous hardcoded behavior when env is unset.
 */

export function trimTrailingSlash (s) {
  return String(s || '').replace(/\/$/, '')
}

export function getOsrmPublicBase () {
  return trimTrailingSlash(import.meta.env.VITE_OSRM_URL || 'https://router.project-osrm.org')
}

export function getMapTileUrlTemplate () {
  return import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
}

/** Google Maps “dir” deep link (override if you use another provider). */
export function getExternalMapsDirBase () {
  return trimTrailingSlash(import.meta.env.VITE_EXTERNAL_MAPS_DIR_URL || 'https://www.google.com/maps/dir')
}

export function getPlaceholderAvatarUrl () {
  return import.meta.env.VITE_PLACEHOLDER_AVATAR_URL || 'https://i.pinimg.com/236x/af/26/28/af26280b0ca305be47df0b799ed1b12b.jpg'
}

export function getAppLogoUrl () {
  return import.meta.env.VITE_APP_LOGO_URL || 'https://upload.wikimedia.org/wikipedia/commons/c/cc/RideEasy_logo_2018.png'
}

/**
 * @param {string} upiUrl - full upi:// pay URL
 */
export function buildUpiQrImageUrl (upiUrl) {
  const base = trimTrailingSlash(import.meta.env.VITE_QR_CODE_API_BASE || 'https://api.qrserver.com/v1/create-qr-code')
  const params = new URLSearchParams({ size: '240x240', data: String(upiUrl) })
  return `${base}/?${params.toString()}`
}
