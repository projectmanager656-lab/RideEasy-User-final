import React, { createContext, useEffect, useMemo } from 'react'
import { io } from 'socket.io-client'
import { getSocketBaseUrl } from '../config/apiBaseUrl'
import { getCaptainToken } from '../utils/authTokens'

export const SocketContext = createContext(undefined)

/** Always logged (not DEV-gated): ride-dispatch problems are diagnosed from these lines. */
function logSocket (msg, detail) {
  console.info(`[socket] ${msg}`, detail != null ? detail : '')
}

/** Vercel serverless cannot keep Socket.IO connections; set VITE_DISABLE_SOCKET=true there. */
function createNoOpSocket () {
  const noop = () => {}
  return {
    connected: false,
    on: noop,
    off: noop,
    once: noop,
    emit: noop,
    disconnect: noop,
    removeAllListeners: noop,
    connect: noop,
  }
}

const socketUrl = getSocketBaseUrl()

const socket =
  import.meta.env.VITE_DISABLE_SOCKET === 'true'
    ? createNoOpSocket()
    : io(socketUrl, {
        autoConnect: false,
        transports: [ 'websocket', 'polling' ],
        withCredentials: false,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1500,
        reconnectionDelayMax: 10000,
      })

/**
 * Captain JWT used for the last handshake attempt. The callback form of `auth`
 * matters: it is re-evaluated on every connection attempt, so the token written
 * at login is picked up without recreating the socket.
 */
let lastAuthToken = null

/**
 * Re-handshake when the captain token changed inside this SPA session (login or
 * logout without a page reload). No-op while the live connection already used
 * the current token.
 */
function ensureSocketAuth () {
  if (import.meta.env.VITE_DISABLE_SOCKET === 'true') return
  const token = getCaptainToken()
  if (socket.connected && token === lastAuthToken) return
  /**
   * Record the token we are about to handshake with. `syncConnection` replaces
   * `socket.auth` with an object, so the callback form below never runs and
   * `lastAuthToken` would stay null — making this guard always false and turning
   * every call into a disconnect()+connect() loop. That flapping left the driver
   * socket out of `driver-<id>` / `online-drivers`, so ride offers reached 0 sockets.
   */
  lastAuthToken = token
  if (socket.connected) socket.disconnect()
  socket.connect()
}

if (import.meta.env.VITE_DISABLE_SOCKET !== 'true') {
  socket.auth = (cb) => {
    const token = getCaptainToken()
    lastAuthToken = token
    cb(token ? { token } : {})
  }
  socket.on('connect', () => logSocket('connected', { id: socket.id }))
  socket.on('disconnect', (reason) => logSocket('disconnect', reason))
  socket.on('connect_error', (err) => {
    const msg = err?.message || String(err)
    if (msg === 'Unauthorized') {
      console.warn('[socket] handshake rejected — captain token missing/expired; rideRequest will NOT arrive, falling back to /rides/pending polling')
      return
    }
    console.warn('[socket] connect_error', msg)
  })
  socket.io.on('reconnect_attempt', (n) => logSocket('reconnect_attempt', n))
}

const SocketProvider = ({ children }) => {
  const value = useMemo(() => ({ socket, ensureSocketAuth }), [])

  useEffect(() => {
    if (import.meta.env.VITE_DISABLE_SOCKET === 'true') return

    logSocket('initializing', { url: socketUrl })

    let cancelled = false
    const liveUrl = `${socketUrl}/health/live`

    const syncConnection = async () => {
      const token = getCaptainToken()
      if (!token) {
        if (socket.connected) socket.disconnect()
        return
      }
      for (let i = 0; i < 24 && !cancelled; i++) {
        try {
          const res = await fetch(liveUrl, { cache: 'no-store' })
          if (res.ok) break
        } catch {
          /* backend not listening yet */
        }
        await new Promise((r) => setTimeout(r, 400))
      }
      if (cancelled) return
      // The backend rejects unauthenticated sockets and targets drivers by the
      // captain id inside the JWT, so the token must be in the handshake.
      if (socket.auth?.token !== token) {
        socket.auth = { token }
        lastAuthToken = token
        if (socket.connected) socket.disconnect()
      }
      if (!socket.connected) {
        logSocket('backend live OK', liveUrl)
        logSocket('calling socket.connect()', { authenticated: true })
        socket.connect()
      }
    }

    const onSessionChanged = () => { void syncConnection() }
    window.addEventListener('rideeasy:session-changed', onSessionChanged)
    void syncConnection()

    return () => {
      cancelled = true
      window.removeEventListener('rideeasy:session-changed', onSessionChanged)
    }
  }, [])

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  )
}

export default SocketProvider
