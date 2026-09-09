import { Capacitor } from '@capacitor/core'

/**
 * Web admin console — same env rules as other Vite apps.
 * Prefer `VITE_BASE_URL`, then `VITE_API_BASE_URL`.
 */
export const DEFAULT_LOCAL_API_URL = 'http://localhost:5001'

function isLocalApiHost (hostish) {
  const s = String(hostish).toLowerCase()
  return /^(localhost|127\.0\.0\.1|\[::1\])/.test(s)
}

function isPrivateOrLocalHost (hostname) {
  const h = String(hostname || '').toLowerCase()
  if (isLocalApiHost(h)) return true
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(h)) return true
  return false
}

function ensureNativeProductionUrl (u) {
  const isNative = Capacitor.isNativePlatform()
  if (!isNative || !import.meta.env.PROD) return u
  try {
    const hasProto = /^https?:\/\//i.test(u)
    const url = new URL(hasProto ? u : `https://${u}`)
    if (url.protocol === 'http:' && !isPrivateOrLocalHost(url.hostname)) {
      url.protocol = 'https:'
      const out = url.toString().replace(/\/$/, '')
      console.warn('[RideEasy] Using HTTPS for API on native build:', out)
      return out
    }
    return u.replace(/\/$/, '')
  } catch {
    return u
  }
}

export function getApiBaseUrl () {
  const isNative = Capacitor.isNativePlatform()

  const raw =
    import.meta.env.VITE_BASE_URL
    || import.meta.env.VITE_API_BASE_URL
    || (isNative ? '' : (import.meta.env.DEV ? DEFAULT_LOCAL_API_URL : ''))
  let u = String(raw).trim().replace(/\/$/, '')
  if (!u) {
    if (import.meta.env.DEV && !isNative) u = DEFAULT_LOCAL_API_URL
    else if (isNative) {
      console.warn('[RideEasy] VITE_BASE_URL is not set. Set .env.production and rebuild.')
      u = 'http://127.0.0.1:1'
    } else {
      if (import.meta.env.PROD) {
        console.error('[RideEasy] Set VITE_BASE_URL or VITE_API_BASE_URL before `npm run build`.')
      }
      u = DEFAULT_LOCAL_API_URL
    }
  }
  if (/^https?:\/\//i.test(u)) {
    return ensureNativeProductionUrl(u)
  }
  if (u.startsWith('//')) return ensureNativeProductionUrl(`https:${u}`)
  if (
    /^(localhost|127\.0\.0\.1|\[::1\])/i.test(u) ||
    /^192\.168\.\d+\.\d+/.test(u) ||
    /^10\.\d+\.\d+\.\d+/.test(u) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+/.test(u)
  ) {
    return ensureNativeProductionUrl(`http://${u}`)
  }
  return ensureNativeProductionUrl(`https://${u}`)
}

export const API_BASE_URL = getApiBaseUrl()
