import React, { useContext, useEffect, useState } from 'react'
import { CaptainDataContext } from '../context/CaptainContext'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiClient, withCaptainAuth } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'
import { driverBackendJson } from '../services/driverBackendFetch'

const CaptainProtectWrapper = ({
  children
}) => {
  const token = localStorage.getItem('captainToken') || localStorage.getItem('captain-token')
  const navigate = useNavigate()
  const location = useLocation()
  const { captain, setCaptain } = useContext(CaptainDataContext)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retryNonce, setRetryNonce] = useState(0)

  const subscriptionBypassPaths = [
    '/plans',
    '/captain-riding',
    '/captain-ride-complete',
    '/captain/logout',
    '/profile',
    '/history',
    '/captain/history',
    '/earnings',
  ]

  useEffect(() => {
    if (!token) {
      setIsLoading(false)
      navigate('/captain-login', { replace: true })
      return
    }

    let cancelled = false
    setIsLoading(true)
    setLoadError('')
    apiClient.get('/captains/profile', {
      ...withCaptainAuth(),
      timeout: 18000,
    })
      .then((response) => {
        if (cancelled || response.status !== 200) return
        const body = stripApiEnvelope(response.data)
        const cap = body?.captain ?? body
        if (cap && typeof cap === 'object' && (cap._id || cap.email)) {
          setCaptain(cap)
          setLoadError('')
        } else {
          setLoadError('Invalid profile response. Try signing in again.')
        }
      })
      .catch((err) => {
        if (cancelled) return
        if (err.response?.status === 401) {
          localStorage.removeItem('captainToken')
          localStorage.removeItem('captain-token')
          navigate('/captain-login', { replace: true })
          return
        }
        const timedOut = err.code === 'ECONNABORTED' || String(err.message || '').toLowerCase().includes('timeout')
        setLoadError(
          timedOut
            ? 'Request timed out. Start the backend and set VITE_BASE_URL to the API origin (e.g. http://localhost:5001).'
            : 'Could not reach the API. Check the server and VITE_BASE_URL (same host/port as the backend).'
        )
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, navigate, setCaptain, retryNonce])

  useEffect(() => {
    if (!token || !captain?._id) return undefined
    const path = location.pathname || ''
    const allow = subscriptionBypassPaths.some((p) => path === p || path.startsWith(`${p}/`))
    if (allow) return undefined
    let cancelled = false
    driverBackendJson('/driver-subscriptions/my-status')
      .then((sub) => {
        if (cancelled) return
        if (!sub?.active) navigate('/plans', { replace: true })
      })
      .catch(() => {
        if (!cancelled) navigate('/plans', { replace: true })
      })
    return () => {
      cancelled = true
    }
  }, [token, captain?._id, location.pathname, navigate])

  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 px-6 text-zinc-400 text-sm bg-black">
        <p>Loading…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 px-6 text-center bg-black text-white">
        <p className="text-zinc-300 text-sm max-w-md">{loadError}</p>
        <button
          type="button"
          className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 text-sm"
          onClick={() => setRetryNonce((n) => n + 1)}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
      {children}
    </>
  )
}

export default CaptainProtectWrapper
