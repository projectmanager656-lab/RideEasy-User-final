import React, { Suspense, lazy, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import ErrorBoundary from './components/ErrorBoundary'
import MoreOptionsModal from './components/MoreOptionsModal'
import NativeAndroidFlavorRedirect from './components/NativeAndroidFlavorRedirect'
import RidingRouteGuard from './components/RidingRouteGuard'
import { UserDataContext } from './context/UserContext'
import { hasCompletedOnboarding, syncOnboardingFromServer } from './utils/onboarding'
import useAndroidBackButton from './hooks/useAndroidBackButton'
import { useLanguage } from './i18n'
import 'remixicon/fonts/remixicon.css'

const UserLogin = lazy(() => import('./pages/UserLogin'))
const UserSignup = lazy(() => import('./pages/UserSignup'))
const Welcome = lazy(() => import('./pages/Welcome'))
const Home = lazy(() => import('./pages/Home'))
const ChooseRide = lazy(() => import('./pages/ChooseRide'))
const ConfirmPickup = lazy(() => import('./pages/ConfirmPickup'))
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
const EmergencyContact = lazy(() => import('./pages/EmergencyContact'))
const DriverDetails = lazy(() => import('./pages/DriverDetails'))
const UserOtp = lazy(() => import('./pages/UserOtp'))
const Wallet = lazy(() => import('./pages/Wallet'))
const LiveChat = lazy(() => import('./pages/LiveChat'))

const AuthShellLoader = () => {
  const { t } = useLanguage()
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-3 bg-theme-bg text-theme-secondary text-sm">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-theme border-t-brand"
        aria-hidden
      />
      <p>{t('loading')}</p>
    </div>
  )
}

// Controlled fallback for an unexpected error inside the routed content: keeps the
// app shell (and the rider's place) alive instead of unmounting to a blank screen.
const AppCrashFallback = ({ onRetry }) => {
  const { t } = useLanguage()
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-4 bg-theme-bg px-6 text-center">
      <i className="ri-error-warning-line text-4xl text-brand" aria-hidden />
      <p className="text-lg font-semibold text-theme-primary">{t('error_boundary_title')}</p>
      <p className="max-w-sm text-sm text-theme-secondary">{t('error_boundary_body')}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-xl border border-theme bg-theme-card px-5 py-2.5 text-sm font-semibold text-theme-primary active:scale-[0.98]"
      >
        {t('error_boundary_retry')}
      </button>
    </div>
  )
}

const RouteScrollReset = ({ scrollRef }) => {
  const location = useLocation()

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [ location.key, location.pathname, scrollRef ])

  return null
}

// Redirect rules (see UserAppRoot above):
//  - no token + onboarding not done → /welcome
//  - no token + onboarding done     → /login
//  - token (session restored)       → /location (the ride home screen)
//  - token + profile not loadable   → /location (Retry panel, stays signed in)
const UserAppRoot = () => {
  const { authLoading, isAuthenticated, hasSessionToken } = useContext(UserDataContext)
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
    return <AuthShellLoader />
  }

  if (!isAuthenticated) {
    /**
     * A stored token means this device is already signed in — only a 401 clears
     * it. If the profile could not be loaded (offline cold start, server hiccup,
     * suspended account) hand off to the protected shell, which shows a Retry
     * panel. A signed-in rider must never be sent back to Login/Welcome.
     */
    if (hasSessionToken) {
      return <Navigate to="/location" replace />
    }
    // First launch → Welcome (swipe to Login). Returning users go straight
    // to the Login page.
    if (!hasCompletedOnboarding()) {
      return <Navigate to="/welcome" replace />
    }
    return <Navigate to="/login" replace />
  }

  return <Navigate to="/location" replace />
}

const App = () => {
  const { t } = useLanguage()
  const [moreOpen, setMoreOpen] = useState(false)
  const scrollRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const navigationType = useNavigationType()
  const lastNavKeyRef = useRef(location.key)

  // Android hardware Back (no-op on web): registered once, follows app history,
  // exits normally at the root, and never quits out of an active ride/payment.
  useAndroidBackButton({ navigate, pathname: location.pathname })

  /**
   * Lightweight page-switch transition: replay a short CSS animation on the scroll
   * container whenever the route key changes. Forward navigation enters slightly
   * from the right, Back (POP) from the left. It is class-based (GPU transform +
   * opacity only) with no extra wrapper box, so it cannot delay the page, create a
   * layout jump, or change navigation behaviour — the first paint is skipped so the
   * initial screen doesn't animate in.
   */
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (lastNavKeyRef.current === location.key) return
    lastNavKeyRef.current = location.key
    const cls = navigationType === 'POP' ? 'page-enter-back' : 'page-enter-forward'
    el.classList.remove('page-enter-forward', 'page-enter-back')
    void el.offsetWidth // force reflow so the animation restarts on re-added class
    el.classList.add(cls)
  }, [location.key, navigationType])

  // Drop the static boot splash as soon as React has painted instead of leaving
  // it up on a fixed 1.5s timer — the app is already interactive underneath.
  useEffect(() => {
    document.getElementById('boot-splash')?.remove()
  }, [])

  return (
    <div className="relative mx-auto flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-theme-bg text-theme-primary">
      <NativeAndroidFlavorRedirect />
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto scrollbar-hide">
        <RouteScrollReset scrollRef={scrollRef} />
        <ErrorBoundary fallback={(_error, reset) => <AppCrashFallback onRetry={reset} />}>
        <Suspense fallback={<div className="h-full flex items-center justify-center text-theme-muted text-sm bg-theme-bg">{t('loading_rideeasy')}</div>}>
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
            <Route path="/choose-ride" element={<UserProtectWrapper><ChooseRide /></UserProtectWrapper>} />
            <Route path="/confirm-pickup" element={<UserProtectWrapper><ConfirmPickup /></UserProtectWrapper>} />
            <Route path="/searching-for-driver" element={<UserProtectWrapper><SearchingForDriver /></UserProtectWrapper>} />
            <Route path="/safety" element={<UserProtectWrapper><Safety /></UserProtectWrapper>} />
            <Route path="/help" element={<UserProtectWrapper><HelpSupport /></UserProtectWrapper>} />
            <Route path="/faq" element={<UserProtectWrapper><Faq /></UserProtectWrapper>} />
            <Route path="/location" element={<UserProtectWrapper><LocationScreen /></UserProtectWrapper>} />
            <Route path="/ride" element={<UserProtectWrapper><RideTab /></UserProtectWrapper>} />
            <Route path="/history" element={<UserProtectWrapper><RideHistory /></UserProtectWrapper>} />
            <Route path="/invoice/:id" element={<UserProtectWrapper><Invoice /></UserProtectWrapper>} />
            <Route path="/profile" element={<UserProtectWrapper><UserProfile /></UserProtectWrapper>} />
            <Route path="/emergency-contact" element={<UserProtectWrapper><EmergencyContact /></UserProtectWrapper>} />
            <Route path="/driver-details" element={<UserProtectWrapper><DriverDetails /></UserProtectWrapper>} />
            <Route path="/user-otp" element={<UserProtectWrapper><UserOtp /></UserProtectWrapper>} />
            <Route path="/wallet" element={<UserProtectWrapper><Wallet /></UserProtectWrapper>} />
            <Route path="/support/chat" element={<UserProtectWrapper><LiveChat /></UserProtectWrapper>} />
            <Route path="/user/logout" element={<UserProtectWrapper><UserLogout /></UserProtectWrapper>} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </div>
      <BottomNav onMoreClick={() => setMoreOpen(true)} />
      <MoreOptionsModal open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  )
}

export default App
