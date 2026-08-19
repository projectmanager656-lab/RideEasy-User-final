import { createRoot } from 'react-dom/client'
import './index.css'
import 'leaflet/dist/leaflet.css'
import App from './App'
import { BrowserRouter } from 'react-router-dom';
import UserContext from './context/UserContext';
import CaptainContext from './context/CaptainContext';
import SocketProvider from './context/SocketContext';
import { initSentry } from './initSentry';
import { LanguageProvider } from './i18n'

void initSentry();

// Fatal-error surface: if anything throws before React mounts (or the app
// crashes hard), show the error on screen instead of a blank white page.
// This turns "blank page" reports into readable error messages.
function showFatalError (detail) {
  if (document.getElementById('rideeasy-fatal')) return
  const msg = detail?.stack || detail?.message || String(detail)
  const div = document.createElement('div')
  div.id = 'rideeasy-fatal'
  div.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#05070A;color:#fff;padding:28px;font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.6;white-space:pre-wrap;overflow:auto'
  div.textContent = 'RideEasy failed to start:\n\n' + msg
  const reload = document.createElement('button')
  reload.textContent = 'Reload'
  reload.style.cssText = 'display:block;margin-top:16px;padding:10px 20px;background:#FFA800;color:#05070A;border:0;border-radius:8px;font-weight:700;cursor:pointer'
  reload.onclick = () => window.location.reload()
  div.appendChild(reload)
  document.body.appendChild(div)
}
window.addEventListener('error', (e) => showFatalError(e.error || e.message))
window.addEventListener('unhandledrejection', (e) => showFatalError(e.reason))

// Remove the static boot splash once the app has mounted for real.
function removeBootSplash () {
  document.getElementById('boot-splash')?.remove()
}

// PWA / stale-cache safety: after a new build the old hashed JS chunks no
// longer exist. Reload once instead of leaving the user on a blank screen.
let reloadedOnPreloadError = false
window.addEventListener('vite:preloadError', () => {
  if (reloadedOnPreloadError) return
  reloadedOnPreloadError = true
  window.location.reload()
})

// Stale service-worker purge: when the served build differs from the last
// visited build, drop every old service worker + cache and reload once.
// This guarantees a blank page can never survive an app update.
const BUILD_STAMP = '__BUILD_STAMP__'
const STAMP_KEY = 'rideeasy_build_stamp'
const HEALED_KEY = 'rideeasy_sw_healed'

async function purgeStaleServiceWorkers () {
  try {
    const prev = localStorage.getItem(STAMP_KEY)
    localStorage.setItem(STAMP_KEY, BUILD_STAMP)
    if (prev === BUILD_STAMP) return
    if (!('serviceWorker' in navigator)) return
    const regs = await navigator.serviceWorker.getRegistrations().catch(() => [])
    if (regs.length === 0) return
    await Promise.all(regs.map((reg) => reg.unregister().catch(() => {})))
    if (window.caches) {
      const keys = await window.caches.keys().catch(() => [])
      await Promise.all(keys.map((key) => window.caches.delete(key).catch(() => {})))
    }
    if (!sessionStorage.getItem(HEALED_KEY)) {
      sessionStorage.setItem(HEALED_KEY, '1')
      window.location.reload()
    }
  } catch {
    /* never block boot on storage/worker failures */
  }
}
void purgeStaleServiceWorkers()

createRoot(document.getElementById('root')).render(

  <SocketProvider>
    <CaptainContext>
      <UserContext>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <LanguageProvider>
            <App />
          </LanguageProvider>
        </BrowserRouter>
      </UserContext>
    </CaptainContext>
  </SocketProvider>

)

setTimeout(removeBootSplash, 1500)
