import React, { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import InstallPWAButton from './components/InstallPWAButton'
import BottomNav from './components/BottomNav'
import NativeAndroidFlavorRedirect from './components/NativeAndroidFlavorRedirect'
import { getCaptainToken } from './utils/authTokens'
import 'remixicon/fonts/remixicon.css'

const Captainlogin = lazy(() => import('./pages/Captainlogin'))
const CaptainSignup = lazy(() => import('./pages/CaptainSignup'))
const CaptainHome = lazy(() => import('./pages/CaptainHome'))
const CaptainProtectWrapper = lazy(() => import('./pages/CaptainProtectWrapper'))
const CaptainLogout = lazy(() => import('./pages/CaptainLogout'))
const CaptainRiding = lazy(() => import('./pages/CaptainRiding'))
const CaptainRideComplete = lazy(() => import('./pages/CaptainRideComplete'))
const CaptainRideHistory = lazy(() => import('./pages/CaptainRideHistory'))
const DriverEarnings = lazy(() => import('./pages/DriverEarnings'))
const DriverProfile = lazy(() => import('./pages/DriverProfile'))
const DriverPlans = lazy(() => import('./pages/DriverPlans'))

const DriverAppRoot = () => {
  if (getCaptainToken()) return <Navigate to="/captain-home" replace />
  return <Navigate to="/captain-login" replace />
}

const App = () => {
  return (
    <div className="min-h-dvh min-h-screen bg-black text-white pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:pb-20">
      <NativeAndroidFlavorRedirect />
      <Suspense fallback={<div className="h-screen flex items-center justify-center text-zinc-400 text-sm bg-black">Loading RideEasy Driver…</div>}>
        <Routes>
          <Route path="/" element={<DriverAppRoot />} />
          <Route path="/captain-login" element={<Captainlogin />} />
          <Route path="/captain-signup" element={<CaptainSignup />} />
          <Route path="/captain-home" element={<CaptainProtectWrapper><CaptainHome /></CaptainProtectWrapper>} />
          <Route path="/captain-riding" element={<CaptainProtectWrapper><CaptainRiding /></CaptainProtectWrapper>} />
          <Route path="/captain-ride-complete" element={<CaptainProtectWrapper><CaptainRideComplete /></CaptainProtectWrapper>} />
          <Route path="/captain/history" element={<CaptainProtectWrapper><CaptainRideHistory /></CaptainProtectWrapper>} />
          <Route path="/history" element={<CaptainProtectWrapper><CaptainRideHistory /></CaptainProtectWrapper>} />
          <Route path="/earnings" element={<CaptainProtectWrapper><DriverEarnings /></CaptainProtectWrapper>} />
          <Route path="/profile" element={<CaptainProtectWrapper><DriverProfile /></CaptainProtectWrapper>} />
          <Route path="/plans" element={<CaptainProtectWrapper><DriverPlans /></CaptainProtectWrapper>} />
          <Route path="/captain/logout" element={<CaptainProtectWrapper><CaptainLogout /></CaptainProtectWrapper>} />
        </Routes>
      </Suspense>
      <InstallPWAButton />
      <BottomNav />
    </div>
  )
}

export default App
