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

    ;(async () => {
      const liveUrl = `${socketUrl}/health/live`
      for (let i = 0; i < 24 && !cancelled; i++) {
        try {
          const res = await fetch(liveUrl, { cache: 'no-store' })
          if (res.ok) {
            logSocket('backend live OK', liveUrl)
            break
          }
        } catch {
          /* backend not listening yet */
        }
        await new Promise((r) => setTimeout(r, 400))
      }
      if (!cancelled) {
        logSocket('calling socket.connect()')
        socket.connect()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  )
}

export default SocketProvider
