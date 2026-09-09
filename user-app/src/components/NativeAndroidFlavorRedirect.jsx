import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

const DRIVER_APP_ID = 'com.rideeasy.driver'

/**
 * Driver APK uses the same bundled web assets as customer; open captain login at launch.
 */
export default function NativeAndroidFlavorRedirect () {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (import.meta.env.VITE_APP_ROLE === 'user') return
    if (!Capacitor.isNativePlatform()) return
    let cancelled = false
    App.getInfo()
      .then((info) => {
        if (cancelled) return
        if (info?.id === DRIVER_APP_ID && location.pathname === '/') {
          navigate('/captain-login', { replace: true })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [ location.pathname, navigate ])

  return null
}
