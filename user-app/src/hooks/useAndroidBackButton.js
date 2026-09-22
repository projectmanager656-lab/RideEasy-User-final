import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'

/** Ride session marker shared with the ride flow — present while a ride is active. */
const RIDE_SESSION_KEY = 'rideeasy_user_ride'

/** Ride / payment screens where Back must not drop the rider out of the app. */
const PROTECTED_FLOW_PREFIXES = [
  '/riding',
  '/searching-for-driver',
  '/choose-ride',
  '/confirm-pickup',
  '/user-otp',
  '/driver-details',
  '/invoice',
]

function isProtectedFlow (pathname) {
  try {
    if (sessionStorage.getItem(RIDE_SESSION_KEY)) return true
  } catch {
    /* storage unavailable */
  }
  return PROTECTED_FLOW_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/**
 * True when the SPA has a previous entry to pop. React Router (history v5) keeps
 * the entry index in `history.state.idx`; fall back to the WebView's own
 * `canGoBack` if that shape ever changes.
 */
function hasInAppHistory (canGoBack) {
  const idx = typeof window !== 'undefined' ? window.history?.state?.idx : undefined
  if (typeof idx === 'number') return idx > 0
  return Boolean(canGoBack)
}

/**
 * Android hardware Back button.
 *
 * Capacitor's default with no JS listener is `canGoBack() ? goBack() : nothing`,
 * so once the WebView history is exhausted Back becomes a dead key and the app can
 * never be closed with it. Registering a listener restores normal Android
 * behaviour:
 *   - follow the app's own history whenever a previous page exists,
 *   - otherwise exit the app the way Android expects,
 *   - never quit out from under an active ride / payment flow (background instead).
 *
 * Registered exactly once for the app's lifetime; the handler reads live values
 * from refs, so it is never re-registered (no duplicate listeners, no leaks).
 */
export default function useAndroidBackButton ({ navigate, pathname }) {
  const navigateRef = useRef(navigate)
  const pathRef = useRef(pathname)
  navigateRef.current = navigate
  pathRef.current = pathname

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined

    let disposed = false
    let handle = null

    const onBackButton = ({ canGoBack } = {}) => {
      const goBackInApp = () => navigateRef.current(-1)

      if (isProtectedFlow(pathRef.current)) {
        // Active ride / payment: walk the app history, but at the root background
        // the app instead of quitting — never lose an in-progress ride by accident.
        if (hasInAppHistory(canGoBack)) goBackInApp()
        else CapacitorApp.minimizeApp().catch(() => {})
        return
      }

      if (hasInAppHistory(canGoBack)) {
        goBackInApp()
        return
      }

      // Normal Android app-exit behaviour.
      CapacitorApp.exitApp().catch(() => {})
    }

    CapacitorApp.addListener('backButton', onBackButton)
      .then((listener) => {
        if (disposed) listener.remove()
        else handle = listener
      })
      .catch(() => { /* not available on this platform */ })

    return () => {
      disposed = true
      if (handle) handle.remove()
    }
  }, [])
}
