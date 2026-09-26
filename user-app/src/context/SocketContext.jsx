import React, { createContext, useEffect, useMemo } from 'react'
import { io } from 'socket.io-client'
import { getSocketBaseUrl } from '../config/apiBaseUrl'
import { getPassengerToken } from '../utils/authTokens'

/** Default `undefined` when no Provider (must not destructure directly from useContext). */
export const SocketContext = createContext(undefined)

/** Always logged (not DEV-gated): ride-dispatch problems are diagnosed from these lines. */
function logSocket (msg, detail) {
  if (detail !== undefined && detail !== null) console.info(`[socket] ${msg}`, detail)
  else console.info(`[socket] ${msg}`)
}

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

const socketUrl = import.meta.env.VITE_SOCKET_URL || getSocketBaseUrl()

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
 * Token the CURRENT handshake was opened with. Comparing it on every session change
 * is what makes login/account-switch reconnect instead of silently keeping the old
 * JWT on an already-connected socket.
 */
let connectedToken = null

if (import.meta.env.VITE_DISABLE_SOCKET !== 'true') {
  socket.on('connect', () => logSocket('connected', { socketId: socket.id }))
  socket.on('disconnect', (reason) => logSocket('disconnected', { reason }))
  socket.on('connect_error', (err) => logSocket('connect_error', { message: err?.message || String(err) }))
}

const SocketProvider = ({ children }) => {
  const value = useMemo(() => ({ socket }), [])

  useEffect(() => {
    if (import.meta.env.VITE_DISABLE_SOCKET === 'true') return

    let cancelled = false
    const liveUrl = `${socketUrl}/health/live`

    const syncConnection = async () => {
      const token = getPassengerToken()
      if (!token) {
        // Signed out — drop the connection and forget the handshake token.
        connectedToken = null
        socket.auth = {}
        if (socket.connected) socket.disconnect()
        return
      }
      /**
       * Token changed (login / account switch) while connected: the live handshake still
       * carries the old JWT, so force a reconnect with the new one instead of reusing it.
       */
      if (socket.connected && connectedToken && connectedToken !== token) {
        socket.disconnect()
      }
      // Already connected/handshaking with this exact token — nothing to do (no dupes).
      if (connectedToken === token && (socket.connected || socket.active)) return

      // Brief health probe so we connect once the backend is reachable instead of
      // logging a burst of connect errors. Socket.IO owns reconnection after this.
      for (let i = 0; i < 8 && !cancelled; i++) {
        try {
          const res = await fetch(liveUrl, { cache: 'no-store' })
          if (res.ok) break
        } catch {
          /* backend not listening */
        }
        await new Promise((r) => setTimeout(r, 300))
      }
      if (cancelled) return
      socket.auth = { token }
      connectedToken = token
      logSocket('connecting', { url: socketUrl })
      if (!socket.connected) socket.connect()
    }

    const onSessionChanged = () => { void syncConnection() }
    window.addEventListener('rideeasy:session-changed', onSessionChanged)
    void syncConnection()

    return () => {
      cancelled = true
      window.removeEventListener('rideeasy:session-changed', onSessionChanged)
      // Clean disconnect on provider unmount / app shutdown — never leave a live socket behind.
      connectedToken = null
      try { socket.disconnect() } catch { /* ignore */ }
    }
  }, [])

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  )
}

export default SocketProvider
