import { API_BASE_URL } from '../config/apiBaseUrl'

/**
 * Absolute URL for a file served by our own backend's static `/uploads` mount.
 *
 * The backend stores an ABSOLUTE url built from the request Host at upload time
 * (see Backend/src/controllers/user.controller.js: `req.protocol` + `req.get('host')`),
 * so a saved photo keeps whichever origin the uploader used. Switching networks —
 * e.g. the backend moving from one LAN address to another — leaves those stored rows
 * pointing at a host that no longer answers, which surfaces as ERR_ADDRESS_UNREACHABLE
 * on every profile/driver image.
 *
 * So: re-point `/uploads/...` urls at the configured backend origin, and pass
 * everything else (data:, blob:, third-party avatars) through untouched. Both
 * `/uploads/profile/x.jpg` and `http://any-host/uploads/profile/x.jpg` resolve to
 * the same configured backend origin; an absolute non-upload url is never prefixed.
 */
const BACKEND_UPLOAD_PATH = /^\/uploads\//

export function resolveMediaUrl (value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^(data:|blob:|file:|capacitor:)/i.test(raw)) return raw

  if (!/^https?:\/\//i.test(raw)) {
    return `${API_BASE_URL}${raw.startsWith('/') ? raw : `/${raw}`}`
  }

  try {
    const url = new URL(raw)
    if (!BACKEND_UPLOAD_PATH.test(url.pathname)) return raw
    return `${API_BASE_URL}${url.pathname}${url.search}`
  } catch {
    return raw
  }
}
