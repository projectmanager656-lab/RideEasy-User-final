import React, { Suspense, lazy, useContext, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import InstallPWAButton from './components/InstallPWAButton'
import BottomNav from './components/BottomNav'
import NativeAndroidFlavorRedirect from './components/NativeAndroidFlavorRedirect'
import RidingRouteGuard from './components/RidingRouteGuard'
import { UserDataContext } from './context/UserContext'
import { getActiveRide } from './services/rideService'
import { stripApiEnvelope } from './utils/apiBody'
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

const authShellLoader = (
  <div className="h-screen flex flex-col items-center justify-center gap-3 bg-black text-zinc-400 text-sm">
    <div
      className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500"
      aria-hidden
    />
    <p>Loading…</p>
  </div>
)

const UserAppRoot = () => {
  const { authLoading, token } = useContext(UserDataContext)
  // 'loading' | null | ride doc — lets the app recover an in-progress ride
  // after a refresh/restart instead of dropping it.
  const [ activeRide, setActiveRide ] = useState('loading')

  useEffect(() => {
    if (authLoading || !token) {
      setActiveRide(null)
      return
    }
    let cancelled = false
    getActiveRide()
      .then((res) => {
        if (cancelled) return
        const body = stripApiEnvelope(res.data)
        setActiveRide(body && body._id ? body : null)
      })
      .catch(() => {
        if (!cancelled) setActiveRide(null)
      })
    return () => { cancelled = true }
  }, [authLoading, token])

  if (authLoading || (token && activeRide === 'loading')) {
    return authShellLoader
  }

  if (!activeRide) {
    // Start page first — everyone lands on Welcome (Get started → Login/Home).
    return <Navigate to="/welcome" replace />
  }

  const st = String(activeRide.status || '').trim().toLowerCase()
  // Started / completed-but-unpaid rides resume on the full /riding flow.
  if (st === 'started' || st === 'completed') {
    return <Navigate to="/riding" replace state={{ ride: activeRide }} />
  }
  // searching / accepted / arrived resume on Home's matching panels.
  return <Navigate to="/home" replace />
}

const App = () => {
  const location = useLocation()
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/signup' || location.pathname === '/welcome'

  // On a fresh page load (refresh) always land on the Welcome start page.
  // The ref is consumed only on the very first render, so in-app
  // navigation (tap, swipe, login, ride flow) is never redirected.
  const isInitialRender = useRef(true)
  useEffect(() => { isInitialRender.current = false }, [])
  if (isInitialRender.current && location.pathname !== '/welcome') {
    return <Navigate to="/welcome" replace />
  }

  return (
    <div className={`min-h-dvh min-h-screen bg-black text-white ${isAuthRoute ? '' : 'pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:pb-20'}`}>
      <NativeAndroidFlavorRedirect />
      <Suspense fallback={<div className="h-screen flex items-center justify-center text-zinc-400 text-sm bg-black">Loading RideEasy…</div>}>
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
