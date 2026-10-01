import { Capacitor, registerPlugin } from '@capacitor/core'
import { apiClient, withAuth } from '../services/http'

/**
 * Registers the device for FCM/APNs push and stores the token server-side
 * (POST /users/device-token). Web/dev builds are a safe no-op. Runs after
 * login and on every app start so refreshed FCM tokens re-register.
 *
 * Firebase-lifecycle guard: the plugin's register() hard-crashes natively
 * (uncaught IllegalStateException on the CapacitorPlugins thread) when the app
 * has no google-services.json, so a native probe must report an initialized
 * FirebaseApp BEFORE register() is ever called. Adding the real
 * google-services.json turns push on automatically — no code change.
 */
const FirebaseStatus = registerPlugin('FirebaseStatus')

export async function registerPushNotifications () {
  try {
    if (!Capacitor.isNativePlatform()) return

    const status = await FirebaseStatus.isInitialized()
    if (!status?.initialized) {
      // No google-services.json in this build — FCM cannot work here. In-app
      // notifications (Socket.IO) are unaffected; server keeps them in history.
      console.info('[push] Firebase not configured in this build — skipping device registration')
      return
    }

    const { PushNotifications } = await import('@capacitor/push-notifications')

    const perm = await PushNotifications.requestPermissions()
    if (perm?.receive !== 'granted') return

    const token = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('push registration timeout'))
      }, 15000)
      const regHandle = PushNotifications.addListener('registration', (t) => {
        clearTimeout(timeout)
        cleanup()
        resolve(t?.value)
      })
      const errHandle = PushNotifications.addListener('registrationError', (e) => {
        clearTimeout(timeout)
        cleanup()
        reject(new Error(e?.message || 'push registration failed'))
      })
      function cleanup () {
        regHandle?.remove?.()
        errHandle?.remove?.()
      }
      PushNotifications.register()
    })

    if (token) {
      await apiClient.post(
        '/users/device-token',
        { token, platform: Capacitor.getPlatform(), appVersion: import.meta.env.VITE_APP_VERSION || null },
        withAuth(),
      )
    }
  } catch (err) {
    // Push is optional — never block the app over it.
    console.warn('[push] registration skipped:', err?.message)
  }
}
