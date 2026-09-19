import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { apiClient, withAuth } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'
import { getPassengerToken } from '../utils/authTokens'

/** Same key as Home.jsx — in-progress booking hint (never used to open /riding). */
const PASSENGER_BOOKING_SESSION_KEY = 'rideeasy_user_ride'

function notifySessionChanged () {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('rideeasy:session-changed'))
}

function clearPassengerBookingSessionHint () {
  try {
    sessionStorage.removeItem(PASSENGER_BOOKING_SESSION_KEY)
  } catch {
    /* ignore */
  }
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

const UserContext = ({ children }) => {
  const [ token, setToken ] = useState(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
  )
  const [ user, setUser ] = useState(null)
  const [ authLoading, setAuthLoading ] = useState(true)
  const [ profileError, setProfileError ] = useState('')

  const clearSession = useCallback(() => {
    try {
      localStorage.removeItem('token')
    } catch {
      /* ignore */
    }
    clearPassengerBookingSessionHint()
    setToken(null)
    setUser(null)
    setProfileError('')
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
      if (res.status !== 200) {
        setUser(null)
        setProfileError('Could not load profile.')
        return { ok: false }
      }
      const u = parseProfileUser(res.data)
      if (u) {
        setUser(u)
        setProfileError('')
        return { ok: true, user: u }
      }
      setUser(null)
      setProfileError('Invalid profile response. Try signing in again.')
      return { ok: false }
    } catch (err) {
      if (err.response?.status === 401) {
        clearSession()
        return { ok: false }
      }
      const timedOut =
        err.code === 'ECONNABORTED'
        || String(err.message || '').toLowerCase().includes('timeout')
      setProfileError(
        timedOut
          ? 'Request timed out. Start the backend and confirm VITE_BASE_URL in .env.'
          : 'Could not reach the API. Check the server and VITE_BASE_URL.'
      )
      setUser(null)
      return { ok: false }
    }
  }, [ clearSession ])

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      setAuthLoading(true)
      setProfileError('')
      const t = getPassengerToken()
      setToken(t)

      if (!t) {
        setUser(null)
        clearPassengerBookingSessionHint()
        if (!cancelled) setAuthLoading(false)
        return
      }

      try {
        const res = await apiClient.get('/users/profile', {
          ...withAuth(),
          timeout: 18000,
        })
        if (cancelled) return

        if (res.status !== 200) {
          setUser(null)
          setProfileError('Could not load profile.')
          return
        }

        const u = parseProfileUser(res.data)
        if (u) {
          setUser(u)
          setProfileError('')
        } else {
          setUser(null)
          setProfileError('Invalid profile response. Try signing in again.')
        }
      } catch (err) {
        if (cancelled) return
        if (err.response?.status === 401) {
          clearSession()
        } else {
          const timedOut =
            err.code === 'ECONNABORTED'
            || String(err.message || '').toLowerCase().includes('timeout')
          setProfileError(
            timedOut
              ? 'Request timed out. Start the backend and confirm VITE_BASE_URL in .env.'
              : 'Could not reach the API. Check the server and VITE_BASE_URL.'
          )
          setUser(null)
        }
      } finally {
        if (!cancelled) setAuthLoading(false)
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [ clearSession ])

  const isAuthenticated = Boolean(user && (user._id || user.email))
  const hasSessionToken = Boolean(token)

  const value = useMemo(
    () => ({
      user,
      setUser,
      token,
      authLoading,
      profileError,
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
