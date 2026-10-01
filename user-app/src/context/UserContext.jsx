import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { apiClient, withAuth } from '../services/http'
import { API_BASE_URL } from '../config/apiBaseUrl'
import { stripApiEnvelope } from '../utils/apiBody'
import { getPassengerToken } from '../utils/authTokens'
import { clearRideSession } from '../utils/rideSession'

function notifySessionChanged () {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('rideeasy:session-changed'))
}

export const UserDataContext = createContext(undefined)

export function useUserData () {
  const ctx = useContext(UserDataContext)
  if (ctx === undefined) {
    throw new Error('useUserData must be used within UserContext')
  }
  return ctx
}

function parseProfileUser (data) {
  const body = stripApiEnvelope(data)
  const u = body?.user ?? body
  if (u && typeof u === 'object' && (u._id || u.email)) return u
  return null
}

/**
 * Message for a failed `/users/profile` fetch. 401 is handled separately (it is
 * the only outcome that invalidates the stored session) — everything here is a
 * transient/permission failure where the rider stays signed in.
 */
function profileFailureMessage (error) {
  const status = error?.response?.status
  const serverMessage = error?.response?.data?.message || error?.response?.data?.error
  if (serverMessage) return serverMessage
  if (status) return `Could not load your account (HTTP ${status}). Please try again.`
  const timedOut =
    error?.code === 'ECONNABORTED'
    || String(error?.message || '').toLowerCase().includes('timeout')
  return timedOut
    ? `The server at ${API_BASE_URL} did not respond in time. On a phone this usually means it is not on the same Wi-Fi network as the backend.`
    : `Unable to connect to the server at ${API_BASE_URL}. Check that the backend is running and that this device is on the same Wi-Fi network as it.`
}

const UserContext = ({ children }) => {
  const [ token, setToken ] = useState(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
  )
  const [ user, setUser ] = useState(null)
  const [ authLoading, setAuthLoading ] = useState(true)
  const [ profileError, setProfileError ] = useState('')
  /**
   * True when a stored session token exists but `/users/profile` could not be
   * loaded (offline / server hiccup / suspended). The rider is still signed in —
   * this must never be treated as "logged out" and routed to Login.
   */
  const [ profileUnavailable, setProfileUnavailable ] = useState(false)

  const clearSession = useCallback(() => {
    try {
      localStorage.removeItem('token')
    } catch {
      /* ignore */
    }
    clearRideSession()
    setToken(null)
    setUser(null)
    setProfileError('')
    setProfileUnavailable(false)
    notifySessionChanged()
  }, [])

  const setSession = useCallback((nextToken, nextUser) => {
    if (nextToken) {
      try {
        localStorage.setItem('token', nextToken)
      } catch {
        /* ignore */
      }
    } else {
      try {
        localStorage.removeItem('token')
      } catch {
        /* ignore */
      }
    }
    setToken(nextToken)
    setUser(nextUser ?? null)
    setProfileError('')
    setProfileUnavailable(false)
    notifySessionChanged()
  }, [])

  const refreshUser = useCallback(async () => {
    const t = getPassengerToken()
    if (!t) {
      clearSession()
      return { ok: false }
    }
    setToken(t)
    setProfileError('')
    try {
      const res = await apiClient.get('/users/profile', {
        ...withAuth(),
        timeout: 18000,
      })
      const u = res.status === 200 ? parseProfileUser(res.data) : null
      if (u) {
        setUser(u)
        setProfileError('')
        setProfileUnavailable(false)
        return { ok: true, user: u }
      }
      setUser(null)
      setProfileError(profileFailureMessage({ response: { status: res.status } }))
      setProfileUnavailable(true)
      return { ok: false }
    } catch (err) {
      if (err?.response?.status === 401) {
        // Expired / invalid token — the only case that ends the session.
        clearSession()
        return { ok: false }
      }
      // Server hiccup, offline, or a refused account: keep the token so the
      // rider does not have to sign in again.
      setUser(null)
      setProfileError(profileFailureMessage(err))
      setProfileUnavailable(true)
      return { ok: false }
    }
  }, [ clearSession ])

  useEffect(() => {
    let cancelled = false
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

    /** One profile fetch — resolves to a status and never throws. */
    const fetchProfile = async () => {
      try {
        const res = await apiClient.get('/users/profile', {
          ...withAuth(),
          timeout: 18000,
        })
        const u = res.status === 200 ? parseProfileUser(res.data) : null
        if (u) return { status: 'ok', user: u }
        return {
          status: 'unreachable',
          message: profileFailureMessage({ response: { status: res.status } }),
        }
      } catch (err) {
        if (err?.response?.status === 401) return { status: 'invalid' }
        return { status: 'unreachable', message: profileFailureMessage(err) }
      }
    }

    const bootstrap = async () => {
      setAuthLoading(true)
      setProfileError('')
      setProfileUnavailable(false)

      const t = getPassengerToken()
      setToken(t)

      if (!t) {
        // No stored session at all → genuinely signed out.
        setUser(null)
        clearRideSession()
        if (!cancelled) setAuthLoading(false)
        return
      }

      // A cold start on mobile can race a flaky radio/hotspot, and a slow backend
      // can exceed a single request's timeout. Retry transient failures before
      // deciding anything, so a signed-in rider is never bounced to Login.
      let outcome = { status: 'unreachable', message: '' }
      for (let attempt = 0; attempt < 3; attempt += 1) {
        outcome = await fetchProfile()
        if (cancelled) return
        if (outcome.status !== 'unreachable' || attempt === 2) break
        await sleep(attempt === 0 ? 1200 : 2500)
        if (cancelled) return
      }

      if (cancelled) return

      if (outcome.status === 'ok') {
        setUser(outcome.user)
        setProfileError('')
        setProfileUnavailable(false)
      } else if (outcome.status === 'invalid') {
        // Token expired / revoked → clear it so the app can show Login.
        clearSession()
      } else {
        // Offline, server error, or a refused account: keep the session and
        // surface the reason. The rider stays signed in.
        setUser(null)
        setProfileError(outcome.message)
        setProfileUnavailable(true)
      }
      setAuthLoading(false)
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [ clearSession ])

  // Live refs so the resume listener below can read the current values without
  // ever being re-registered (no duplicate listeners).
  const userRef = useRef(null)
  userRef.current = user
  const refreshUserRef = useRef(refreshUser)
  refreshUserRef.current = refreshUser

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined
    let disposed = false
    let handle = null
    CapacitorApp.addListener('resume', () => {
      // The Android Home button backgrounds the app and the WebView keeps its state,
      // so resuming normally needs no work. The case worth acting on is a session
      // whose profile never loaded (we were offline / the server was down): retry it
      // now rather than leaving the rider on a Retry panel.
      if (getPassengerToken() && !userRef.current) void refreshUserRef.current()
    })
      .then((listener) => {
        if (disposed) listener.remove()
        else handle = listener
      })
      .catch(() => { /* not available on this platform */ })
    return () => {
      disposed = true
      if (handle) handle.remove()
    }
  }, [])

  const isAuthenticated = Boolean(user && (user._id || user.email))
  const hasSessionToken = Boolean(token)

  const value = useMemo(
    () => ({
      user,
      setUser,
      token,
      authLoading,
      profileError,
      profileUnavailable,
      isAuthenticated,
      hasSessionToken,
      setSession,
      clearSession,
      refreshUser,
    }),
    [
      user,
      token,
      authLoading,
      profileError,
      profileUnavailable,
      isAuthenticated,
      hasSessionToken,
      setSession,
      clearSession,
      refreshUser,
    ]
  )

  return (
    <UserDataContext.Provider value={value}>
      {children}
    </UserDataContext.Provider>
  )
}

export default UserContext
