import React, { createContext, useEffect, useMemo } from 'react'
import { io } from 'socket.io-client'
import { getSocketBaseUrl } from '../config/apiBaseUrl'

export const SocketContext = createContext(undefined)

function logSocket (msg, detail) {
  if (import.meta.env.DEV) {
    console.info(`[socket] ${msg}`, detail != null ? detail : '')
  }
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

if (import.meta.env.VITE_DISABLE_SOCKET !== 'true') {
  socket.on('connect', () => logSocket('connected', { id: socket.id }))
  socket.on('disconnect', (reason) => logSocket('disconnect', reason))
  socket.on('connect_error', (err) => logSocket('connect_error', err?.message || err))
  socket.io.on('reconnect_attempt', (n) => logSocket('reconnect_attempt', n))
}

const SocketProvider = ({ children }) => {
  const value = useMemo(() => ({ socket }), [])

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
