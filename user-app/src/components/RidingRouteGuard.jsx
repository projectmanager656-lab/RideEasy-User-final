import React, { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { getActiveRide } from '../services/rideService'
import { stripApiEnvelope } from '../utils/apiBody'

/** Only these rides belong on the full-screen /riding flow (after trip has started). */
const ALLOWED = new Set([ 'started', 'completed' ])

function normalizeStatus (s) {
  return String(s || '').trim().toLowerCase()
}

/**
 * Prevents opening /riding from bookmarks, stale history, or the tab bar
 * unless navigation included a ride in `started` or `completed` state.
 * On a hard refresh (no navigation state) it recovers the passenger's
 * active ride from the backend so an in-progress trip is never lost.
 */
export default function RidingRouteGuard ({ children }) {
  const location = useLocation()
  const [ recovered, setRecovered ] = useState('loading')
  const ride = location.state?.ride
  const id = ride?._id
  const st = normalizeStatus(ride?.status)

  useEffect(() => {
    if (id) {
      setRecovered('done')
      return
    }
    let cancelled = false
    setRecovered('loading')
    getActiveRide()
      .then((res) => {
        if (cancelled) return
        const body = stripApiEnvelope(res.data)
        setRecovered(body && body._id ? body : 'none')
      })
      .catch(() => {
        if (!cancelled) setRecovered('none')
      })
    return () => { cancelled = true }
  }, [ id ])

  if (id) {
    if (!ALLOWED.has(st)) {
      return <Navigate to="/home" replace />
    }
    return children
  }

  if (recovered === 'loading') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-black text-zinc-400 text-sm">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" aria-hidden />
        <p>Resuming ride…</p>
      </div>
    )
  }

  if (recovered === 'none') {
    return <Navigate to="/home" replace />
  }

  const recoveredSt = normalizeStatus(recovered.status)
  if (!ALLOWED.has(recoveredSt)) {
    return <Navigate to="/home" replace />
  }

  return <Navigate to="/riding" replace state={{ ride: recovered }} />
}