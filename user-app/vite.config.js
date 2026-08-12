import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const extraAllowedHosts = (env.VITE_DEV_ALLOWED_HOSTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const allowedHosts = [ '.onrender.com', 'localhost', ...extraAllowedHosts ]

  return {
    /** Capacitor WebView: relative asset URLs load reliably from https://localhost */
    base: './',
    define: {
      'import.meta.env.VITE_APP_ROLE': JSON.stringify('user'),
      'import.meta.env.VITE_BASE_URL': JSON.stringify(env.VITE_BASE_URL || 'http://localhost:5001'),
      'import.meta.env.VITE_SOCKET_URL': JSON.stringify(env.VITE_SOCKET_URL || env.VITE_BASE_URL || 'http://localhost:5001'),
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [ 'vite.svg', 'offline.html' ],
        manifest: {
          name: 'RideEasy Passenger',
          short_name: 'RideEasy',
          description: 'Passenger app — book rides in Pune & Kolhapur with RideEasy.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#000000',
          theme_color: '#10b981',
          orientation: 'portrait-primary',
          icons: [
            {
              src: '/icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/icons/maskable-icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icons/maskable-icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/.*/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'external-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24
                }
              }
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/users/login') || url.pathname.startsWith('/users/signup') || url.pathname.startsWith('/captains/login') || url.pathname.startsWith('/captains/register') || url.pathname.startsWith('/rides/create') || url.pathname.startsWith('/payments') || url.pathname.startsWith('/admin/login'),
              handler: 'NetworkOnly',
              options: {
                cacheName: 'auth-api-cache'
              }
            }
          ]
        }
      }),
    ],
    server: {
      host: true,
      allowedHosts,
    },
    preview: {
      host: true,
      allowedHosts,
    },
  }
})
