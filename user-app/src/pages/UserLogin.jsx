import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import AuthScreen from '../components/auth/AuthScreen'
import { useUserData } from '../context/UserContext'
import { hasCompletedOnboarding } from '../utils/onboarding'

/**
 * Login page — the full RideEasy auth flow (login + slide-up registration + OTP).
 * First-time visitors who have not completed onboarding are sent to the
 * Welcome page first, so the welcome screen always appears before login.
 */
const UserLogin = () => {
  const { token } = useUserData()
  const location = useLocation()
  const fromWelcome = location.state?.fromWelcome === true

if (!token && !hasCompletedOnboarding() && !fromWelcome) {
    return <Navigate to="/welcome" replace />
  }

  // TEMP: arriving from the Welcome page must show the login form even when an
  // old session exists (remove along with TEMP_RELOAD_TO_WELCOME).
  return <AuthScreen skipTokenRedirect={fromWelcome} />
}

export default UserLogin