import React, { Suspense, lazy, useContext, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import InstallPWAButton from './components/InstallPWAButton'
import BottomNav from './components/BottomNav'
import NativeAndroidFlavorRedirect from './components/NativeAndroidFlavorRedirect'
import RidingRouteGuard from './components/RidingRouteGuard'
import { UserDataContext } from './context/UserContext'
import { hasCompletedOnboarding, syncOnboardingFromServer } from './utils/onboarding'
import 'remixicon/fonts/remixicon.css'

const UserLogin = lazy(() => import('./pages/UserLogin'))
const UserSignup = lazy(() => import('./pages/UserSignup'))
const Welcome = lazy(() => import('./pages/Welcome'))
const Home = lazy(() => import('./pages/Home'))
const UserProtectWrapper = lazy(() => import('./pages/UserProtectWrapper'))
const UserLogout = lazy(() => import('./pages/UserLogout'))
const Riding = lazy(() => import('./pages/Riding'))
const RideHistory = lazy(() => import('./pages/RideHistory'))
const UserProfile = lazy(() => import('./pages/UserProfile'))
const EmergencyContact = lazy(() => import('./pages/EmergencyContact'))

const authShellLoader = (
  <div className="h-screen flex flex-col items-center justify-center gap-3 bg-theme-bg text-theme-secondary text-sm">
    <div
      className="h-8 w-8 animate-spin rounded-full border-2 border-theme border-t-brand"
      aria-hidden
    />
    <p>Loading…</p>
  </div>
)

// TODO: TEMPORARY — remove after project completion.
// Every page refresh jumps to the Welcome ("Get started") page.
const TEMP_RELOAD_TO_WELCOME = true

const UserAppRoot = () => {
  const { authLoading, token } = useContext(UserDataContext)
  const [ serverSynced, setServerSynced ] = useState(false)

  // Restore this device's server-side onboarding state (if the local flag
  // was lost) before deciding where to redirect.
  useEffect(() => {
    let mounted = true
    syncOnboardingFromServer().then(() => {
      if (mounted) setServerSynced(true)
    })
    return () => { mounted = false }
  }, [])

  void serverSynced

  if (authLoading) {
    return authShellLoader
  }

  if (!token) {
    // First launch → Welcome (swipe to Login). Returning users go straight
    // to the Login page.
    if (!hasCompletedOnboarding()) {
      return <Navigate to="/welcome" replace />
    }
    return <Navigate to="/login" replace />
  }

  return <Navigate to="/home" replace />
}

const App = () => {
  const location = useLocation()
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/signup' || location.pathname === '/welcome'

  // TEMP: on a fresh page load (refresh) always land on the Welcome page.
  // The ref is consumed only on the very first render, so in-app
  // navigation (swipe/tap Get started, login) is never redirected.
  const isInitialRender = useRef(true)
  useEffect(() => { isInitialRender.current = false }, [])
  if (TEMP_RELOAD_TO_WELCOME && isInitialRender.current && location.pathname !== '/welcome') {
    return <Navigate to="/welcome" replace />
  }

  return (
      <div className={`min-h-dvh min-h-screen bg-theme-bg text-theme-primary ${isAuthRoute ? '' : 'pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:pb-20'}`}>
      <NativeAndroidFlavorRedirect />
      <Suspense fallback={<div className="h-screen flex items-center justify-center text-theme-secondary text-sm bg-theme-bg">Loading RideEasy…</div>}>
        <Routes>
          <Route path="/" element={<UserAppRoot />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/login" element={<UserLogin />} />
          <Route path="/signup" element={<UserSignup />} />
          <Route
            path="/riding"
            element={(
              <UserProtectWrapper>
                <RidingRouteGuard>
                  <Riding />
                </RidingRouteGuard>
              </UserProtectWrapper>
            )}
          />
          <Route path="/home" element={<UserProtectWrapper><Home /></UserProtectWrapper>} />
<Route path="/history" element={<UserProtectWrapper><RideHistory /></UserProtectWrapper>} />
           <Route path="/emergency-contact" element={<UserProtectWrapper><EmergencyContact /></UserProtectWrapper>} />
           <Route path="/profile" element={<UserProtectWrapper><UserProfile /></UserProtectWrapper>} />
          <Route path="/user/logout" element={<UserProtectWrapper><UserLogout /></UserProtectWrapper>} />
        </Routes>
      </Suspense>
      <InstallPWAButton />
      <BottomNav />
    </div>
  )
}

export default App
