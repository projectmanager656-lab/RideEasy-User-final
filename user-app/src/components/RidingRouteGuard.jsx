import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'

/** Only these rides belong on the full-screen /riding flow (after trip has started). */
const ALLOWED = new Set([ 'started', 'completed' ])

/** Session key written by ChooseRide / SearchingForDriver / Home for the passenger's current ride. */
const USER_RIDE_SESSION_KEY = 'rideeasy_user_ride'

function normalizeStatus (s) {
  return String(s || '').trim().toLowerCase()
}

function sessionRideId () {
  try {
    return sessionStorage.getItem(USER_RIDE_SESSION_KEY) || null
  } catch {
    return null
  }
}

/**
 * Prevents opening /riding from bookmarks, stale history, or the tab bar
 * unless navigation included a ride in `started`/`completed` state — or the
 * session still references an active ride (the Riding page then fetches the
 * ride itself and redirects to the right screen when it is not live).
 */
export default function RidingRouteGuard ({ children }) {
  const location = useLocation()
  const ride = location.state?.ride
  const id = ride?._id
  const st = normalizeStatus(ride?.status)

  if (!id) {
    if (!sessionRideId()) {
      return <Navigate to="/home" replace />
    }
    // No ride in navigation state but the session has one — let Riding hydrate.
    return children
  }
  if (!ALLOWED.has(st)) {
    return <Navigate to="/home" replace />
  }

  return children
}
