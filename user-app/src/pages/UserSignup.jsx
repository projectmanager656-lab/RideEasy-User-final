import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'

/**
 * Registration is part of the login screen (animated slide-up panel).
 * Legacy /signup links open that panel directly.
 */
const UserSignup = () => {
  const location = useLocation()
  const target = `/login?mode=signup${location.search ? `&${location.search.slice(1)}` : ''}`
  return <Navigate to={target} replace />
}

export default UserSignup