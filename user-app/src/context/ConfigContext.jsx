import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { apiClient } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'
import { useSocket } from '../hooks/useSocket'
import { FARE_CONFIG_UPDATED, RIDEEASY_SUPPORT_UPDATED } from '../constants/rideSocketEvents'

/** Default `undefined` when no Provider (must not destructure directly from useContext). */
export const ConfigContext = createContext(undefined)

/**
 * Versions are ISO timestamps of the source document's `updatedAt`. ISO strings
 * compare lexicographically, so "newer" is a plain `>` — stale/duplicate socket
 * events (or an older API response racing a push) are ignored.
 */
function isNewer (incoming, current) {
  if (!incoming) return false
  if (!current) return true
  return String(incoming) > String(current)
}

/**
 * Real-time admin configuration: fare config + RideEasy Support.
 *
 * The REST endpoints are the source of truth on startup and socket reconnect;
 * `fareConfigUpdated` / `rideeasySupportUpdated` socket events apply changes
 * instantly in between. One shared socket — no extra connections.
 */
const ConfigProvider = ({ children }) => {
  const socket = useSocket()
  const [fareConfig, setFareConfig] = useState(null)
  const [support, setSupport] = useState(null)
  const [supportSettled, setSupportSettled] = useState(false)
  const fareVersionRef = useRef(null)
  const supportVersionRef = useRef(null)

  const loadFareConfig = () => {
    apiClient
      .get('/config/fare')
      .then((res) => {
        const cfg = stripApiEnvelope(res.data)?.fareConfig
        if (!cfg || !isNewer(cfg.version, fareVersionRef.current)) return
        fareVersionRef.current = cfg.version
        setFareConfig(cfg)
      })
      .catch(() => { /* keep last known config offline */ })
  }

  const loadSupport = () => {
    return apiClient
      .get('/config/rideeasy-support')
      .then((res) => {
        const cfg = stripApiEnvelope(res.data)?.rideeasySupport
        if (cfg && isNewer(cfg.version, supportVersionRef.current)) {
          supportVersionRef.current = cfg.version
          setSupport(cfg)
        }
      })
      .catch(() => { /* keep last known config offline */ })
      .finally(() => setSupportSettled(true))
  }

  // Initial load — API first, so the app has data even before the socket connects.
  useEffect(() => {
    void loadFareConfig()
    void loadSupport()
  }, [])

  useEffect(() => {
    if (!socket) return undefined

    const onFareConfig = (payload) => {
      const version = payload?.version
      if (!isNewer(version, fareVersionRef.current)) return
      fareVersionRef.current = version
      setFareConfig({ version, rates: payload?.rates || null })
    }

    const onSupport = (payload) => {
      const version = payload?.version
      if (!isNewer(version, supportVersionRef.current)) return
      supportVersionRef.current = version
      setSupport({
        name: payload?.name || '',
        phone: payload?.phone || '',
        description: payload?.description || '',
        isActive: payload?.isActive !== false,
        version,
      })
    }

    // Fires on the first connect and on every reconnect — refetch so a client
    // that was offline catches up instead of running on stale config.
    const onConnect = () => {
      void loadFareConfig()
      void loadSupport()
    }

    socket.on(FARE_CONFIG_UPDATED, onFareConfig)
    socket.on(RIDEEASY_SUPPORT_UPDATED, onSupport)
    socket.on('connect', onConnect)
    return () => {
      socket.off(FARE_CONFIG_UPDATED, onFareConfig)
      socket.off(RIDEEASY_SUPPORT_UPDATED, onSupport)
      socket.off('connect', onConnect)
    }
  }, [socket])

  const value = useMemo(
    () => ({ fareConfig, support, supportSettled }),
    [fareConfig, support, supportSettled],
  )

  return (
    <ConfigContext.Provider value={value}>
      {children}
    </ConfigContext.Provider>
  )
}

export default ConfigProvider
