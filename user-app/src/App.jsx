import React, { Suspense, lazy, useContext } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import InstallPWAButton from './components/InstallPWAButton'
import BottomNav from './components/BottomNav'
import NativeAndroidFlavorRedirect from './components/NativeAndroidFlavorRedirect'
import RidingRouteGuard from './components/RidingRouteGuard'
import { UserDataContext } from './context/UserContext'
import 'remixicon/fonts/remixicon.css'

const UserLogin = lazy(() => import('./pages/UserLogin'))
const UserSignup = lazy(() => import('./pages/UserSignup'))
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

  if (authLoading) {
    return authShellLoader
  }

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to="/home" replace />
}

const App = () => {
  return (
    <div className="min-h-dvh min-h-screen bg-black text-white pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:pb-20">
      <NativeAndroidFlavorRedirect />
      <Suspense fallback={<div className="h-screen flex items-center justify-center text-zinc-400 text-sm bg-black">Loading RideEasy…</div>}>
        <Routes>
          <Route path="/" element={<UserAppRoot />} />
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
