import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'

/** Only these rides belong on the full-screen /riding flow (after trip has started). */
const ALLOWED = new Set([ 'started', 'completed' ])

function normalizeStatus (s) {
  return String(s || '').trim().toLowerCase()
}

/**
 * Prevents opening /riding from bookmarks, stale history, or the tab bar
 * unless navigation included a ride in `started` or `completed` state.
 */
export default function RidingRouteGuard ({ children }) {
  const location = useLocation()
  const ride = location.state?.ride
  const id = ride?._id
  const st = normalizeStatus(ride?.status)

  if (!id) {
    return <Navigate to="/home" replace />
  }
  if (!ALLOWED.has(st)) {
    return <Navigate to="/home" replace />
  }

  return children
}
