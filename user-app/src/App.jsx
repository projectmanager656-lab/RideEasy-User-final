import React, { Suspense, lazy, useContext, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import InstallPWAButton from './components/InstallPWAButton'
import BottomNav from './components/BottomNav'
import MoreOptionsModal from './components/MoreOptionsModal'
import NativeAndroidFlavorRedirect from './components/NativeAndroidFlavorRedirect'
import RidingRouteGuard from './components/RidingRouteGuard'
import { UserDataContext } from './context/UserContext'
import 'remixicon/fonts/remixicon.css'

const UserLogin = lazy(() => import('./pages/UserLogin'))
const UserSignup = lazy(() => import('./pages/UserSignup'))
const Home = lazy(() => import('./pages/Home'))
const ChooseRide = lazy(() => import('./pages/ChooseRide'))
const SearchingForDriver = lazy(() => import('./pages/SearchingForDriver'))
const Safety = lazy(() => import('./pages/Safety'))
const HelpSupport = lazy(() => import('./pages/HelpSupport'))
const Faq = lazy(() => import('./pages/Faq'))
const LocationScreen = lazy(() => import('./pages/LocationScreen'))
const RideTab = lazy(() => import('./pages/RideTab'))
const UserProtectWrapper = lazy(() => import('./pages/UserProtectWrapper'))
const UserLogout = lazy(() => import('./pages/UserLogout'))
const Riding = lazy(() => import('./pages/Riding'))
const RideHistory = lazy(() => import('./pages/RideHistory'))
const Invoice = lazy(() => import('./pages/Invoice'))
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

  return <Navigate to="/location" replace />
}

const App = () => {
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const hideScrollbar = ['/help', '/safety', '/faq'].includes(location.pathname) || location.pathname.startsWith('/invoice/')

  return (
    <div className="relative mx-auto flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-black text-white">
      <NativeAndroidFlavorRedirect />
      <div className={`relative min-h-0 flex-1 overflow-y-auto ${hideScrollbar ? 'scrollbar-hide' : ''}`}>
        <Suspense fallback={<div className="h-full flex items-center justify-center text-zinc-400 text-sm bg-black">Loading RideEasy…</div>}>
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
            <Route path="/choose-ride" element={<UserProtectWrapper><ChooseRide /></UserProtectWrapper>} />
            <Route path="/searching-for-driver" element={<UserProtectWrapper><SearchingForDriver /></UserProtectWrapper>} />
            <Route path="/safety" element={<UserProtectWrapper><Safety /></UserProtectWrapper>} />
            <Route path="/help" element={<UserProtectWrapper><HelpSupport /></UserProtectWrapper>} />
            <Route path="/faq" element={<UserProtectWrapper><Faq /></UserProtectWrapper>} />
            <Route path="/location" element={<UserProtectWrapper><LocationScreen /></UserProtectWrapper>} />
            <Route path="/ride" element={<UserProtectWrapper><RideTab /></UserProtectWrapper>} />
            <Route path="/history" element={<UserProtectWrapper><RideHistory /></UserProtectWrapper>} />
            <Route path="/invoice/:id" element={<UserProtectWrapper><Invoice /></UserProtectWrapper>} />
            <Route path="/profile" element={<UserProtectWrapper><UserProfile /></UserProtectWrapper>} />
            <Route path="/user/logout" element={<UserProtectWrapper><UserLogout /></UserProtectWrapper>} />
          </Routes>
        </Suspense>
        <InstallPWAButton />
      </div>
      <BottomNav onMoreClick={() => setMoreOpen(true)} />
      <MoreOptionsModal open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  )
}

export default App
