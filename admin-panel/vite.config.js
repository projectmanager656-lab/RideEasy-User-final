import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const extraAllowedHosts = (env.VITE_DEV_ALLOWED_HOSTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const allowedHosts = [ '.onrender.com', 'localhost', ...extraAllowedHosts ]

  return {
    base: './',
    define: {
      'import.meta.env.VITE_APP_ROLE': JSON.stringify('admin'),
    },
    plugins: [
      react(),
    ],
    server: {
      host: true,
      port: 5175,
      allowedHosts,
    },
    preview: {
      host: true,
      allowedHosts,
    },
  }
})
