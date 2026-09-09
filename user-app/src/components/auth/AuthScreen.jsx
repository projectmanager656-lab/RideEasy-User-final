import React, { useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { UserDataContext } from '../../context/UserContext'
import { apiClient } from '../../services/http'
import { formatApiError } from '../../utils/apiError'
import { stripApiEnvelope } from '../../utils/apiBody'
import AuthShell from '../../components/auth/AuthShell'
import LoginForm from '../../components/auth/LoginForm'
import RegistrationForm from '../../components/auth/RegistrationForm'
import OtpVerification from '../../components/auth/OtpVerification'
import { markOnboardingComplete } from '../../utils/onboarding'
import { useLanguage } from '../../i18n'
import { useTheme } from '../../context/ThemeContext'
import lightBg from '../../assets/white.png'
import darkBg from '../../assets/black.png'

/**
 * RideEasy authentication flow (smart detection):
 *   email/phone → /users/check-user → EXISTING → password → login verifies
 *                                              → OTP sent → verify → /location
 *                                  → NEW      → registration panel slides up
 *                                              → Send OTP → OTP verification
 *                                              → auto-authenticated → /location
 * The /location screen runs the geolocation + Location Accuracy flow; the user
 * continues to Home from there ("Where to go?"). No "Sign up" button: new
 * users are detected automatically.
 */
const AuthScreen = ({ skipTokenRedirect = false }) => {
  const { t } = useLanguage()
  const { isDark } = useTheme()
  const { setSession, authLoading, token } = useContext(UserDataContext)
  const navigate = useNavigate()
  const location = useLocation()
  const [ searchParams ] = useSearchParams()

  const initialRegister = searchParams.get('mode') === 'signup'

  const [ registerOpen, setRegisterOpen ] = useState(initialRegister)
  const [ otpOpen, setOtpOpen ] = useState(false)

  // login state
  const [ identifier, setIdentifier ] = useState('')
  const [ password, setPassword ] = useState('')
  const [ loginError, setLoginError ] = useState('')
  const [ loginLoading, setLoginLoading ] = useState(false)

  // account-detection state: unknown → checking → existing | new
  // Default to `existing` so the email/password login form is immediately
  // usable. The backend signs users in with POST /users/login (email+password)
  // and returns { token, user } directly — there is no separate check endpoint.
  const initialAccountState = initialRegister ? 'new' : 'existing'
  const [ accountState, setAccountState ] = useState(initialAccountState)
  const [ checkingAccount, setCheckingAccount ] = useState(false)

  // registration state (shared between the registration + OTP panes)
  // `password` holds the password the user chose on the signup form so it can
  // be stored on the account once the phone OTP is verified.
  const [ draft, setDraft ] = useState({ name: '', email: '', phone: '', password: '' })
  const [ regError, setRegError ] = useState('')
  const [ regDuplicate, setRegDuplicate ] = useState(false)
  const [ regLoading, setRegLoading ] = useState(false)
  const [ regDebugOtp, setRegDebugOtp ] = useState('')

  // login-OTP state (password-verified → OTP step)
  const [ loginOtpIdentifier, setLoginOtpIdentifier ] = useState('')
  const [ loginOtpDevOtp, setLoginOtpDevOtp ] = useState('')

  const registerRef = useRef(null)
  const otpRef = useRef(null)
  const registerInit = useRef(false)
  const otpInit = useRef(false)

  useEffect(() => {
    if (authLoading) return
    if (token && !skipTokenRedirect) {
      // Session already active → land on the /location home screen, where the
      // existing LocationScreen geolocation / Location Accuracy flow lives.
      navigate('/location', { replace: true })
    }
  }, [ authLoading, token, navigate, skipTokenRedirect ])

  // Registration panel: slides up from the bottom, slides down to close.
  useGSAP(() => {
    const el = registerRef.current
    if (registerOpen) {
      gsap.fromTo(el,
        { yPercent: 100, autoAlpha: 0, pointerEvents: 'none' },
        {
          yPercent: 0,
          autoAlpha: 1,
          pointerEvents: 'auto',
          duration: 0.45,
          ease: 'power2.inOut',
          overwrite: 'auto',
          onComplete: () => {
            const scroller = el?.querySelector('[data-pane-scroll]')
            if (scroller) scroller.scrollTop = 0
          },
        }
      )
    } else if (registerInit.current) {
      gsap.to(el, {
        yPercent: 100,
        autoAlpha: 0,
        pointerEvents: 'none',
        duration: 0.35,
        ease: 'power2.inOut',
        overwrite: 'auto',
      })
    } else {
      gsap.set(el, { yPercent: 100, autoAlpha: 0, pointerEvents: 'none' })
    }
    registerInit.current = true
  }, [ registerOpen ])

  // OTP panel: slides in above the registration panel.
  useGSAP(() => {
    const el = otpRef.current
    if (otpOpen) {
      gsap.fromTo(el,
        { yPercent: 30, autoAlpha: 0, pointerEvents: 'none' },
        {
          yPercent: 0,
          autoAlpha: 1,
          pointerEvents: 'auto',
          duration: 0.4,
          ease: 'power2.out',
          overwrite: 'auto',
          onComplete: () => {
            const scroller = el?.querySelector('[data-pane-scroll]')
            if (scroller) scroller.scrollTop = 0
          },
        }
      )
    } else if (otpInit.current) {
      gsap.to(el, {
        yPercent: 30,
        autoAlpha: 0,
        pointerEvents: 'none',
        duration: 0.3,
        ease: 'power2.in',
        overwrite: 'auto',
      })
    } else {
      gsap.set(el, { yPercent: 30, autoAlpha: 0, pointerEvents: 'none' })
    }
    otpInit.current = true
  }, [ otpOpen ])

  const completeAuth = (nextToken, nextUser) => {
    markOnboardingComplete()
    setSession(nextToken, nextUser)
    // Fresh login/registration → run the LocationScreen geolocation +
    // Location Accuracy flow first; the user continues to Home from there.
    navigate('/location', { replace: true, state: location?.state })
  }

  const handleIdentifierChange = (value) => {
    setIdentifier(value)
    setAccountState('existing') // keep the email/password login form visible as the user types
    setLoginError('')
  }

  // Backend account lookup — no standalone check endpoint exists, so this is a
  // local transition used when the user taps "Create account" / enters the flow.
  // Accounts are verified by POST /users/login (email+password) directly.
  const checkAccount = async (id) => {
    if (checkingAccount) return
    const cleanId = String(id || identifier || '').trim()
    if (cleanId.length < 3) return
    setCheckingAccount(true)
    setLoginError('')
    try {
      // A phone/email that has no local record is treated as a new account:
      // reveal the registration panel with the identifier pre-filled.
      setAccountState('new')
      const isEmailLike = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanId)
      setDraft((prev) => ({
        ...prev,
        email: isEmailLike ? cleanId.toLowerCase() : prev.email,
        phone: isEmailLike ? prev.phone : cleanId.replace(/[+\s-]/g, '').slice(-10),
      }))
      setRegError('')
      setRegDuplicate(false)
      setRegisterOpen(true)
    } catch (err) {
      setLoginError(formatApiError(err))
    } finally {
      setCheckingAccount(false)
    }
  }

  const submitLogin = async (e) => {
    e.preventDefault()
    const id = String(identifier || '').trim()
    if (!id || loginLoading) return
    if (!password) return
    setLoginError('')
    setLoginLoading(true)
    try {
      // Backend contract: POST /users/login with { email, password } → { token, user }.
      const response = await apiClient.post('/users/login', {
        email: id,
        password,
      })
      const data = stripApiEnvelope(response.data)
      const token = data?.token
      const user = data?.user ?? data
      if (token && user) {
        completeAuth(token, user)
      } else {
        setLoginError(t('login_response_missing'))
      }
    } catch (err) {
      setLoginError(formatApiError(err))
    } finally {
      setLoginLoading(false)
    }
  }

  const sendOtp = async (payload) => {
    setRegError('')
    setRegDuplicate(false)
    setRegLoading(true)
    // A login-OTP session must not leak into the registration flow.
    setLoginOtpIdentifier('')
    setLoginOtpDevOtp('')
    // Persist the full draft (incl. the chosen password) so the OTP step can
    // finalize the account with a working password.
    if (payload?.password) setDraft((prev) => ({ ...prev, ...payload }))
    try {
      const response = await apiClient.post('/users/phone/send-otp', payload)
      const data = stripApiEnvelope(response.data)
      if (data?.debugOtp) setRegDebugOtp(String(data.debugOtp))
      setOtpOpen(true)
    } catch (err) {
      if (err.response?.status === 409) {
        setRegDuplicate(true)
      } else {
        setRegError(formatApiError(err))
      }
    } finally {
      setRegLoading(false)
    }
  }

  const goToLogin = () => {
    const prefilled = String(draft.email || draft.phone || '').trim()
    if (prefilled) setIdentifier(prefilled)
    setAccountState('existing')
    setPassword('')
    setOtpOpen(false)
    setRegisterOpen(false)
  }

  // Pane = outer positioned layer (GSAP slides this); a scroller sits inside
  // so each pane's artwork backdrop can fill the screen without scrolling away.
  // CSS fallback hidden state — GSAP overrides these inline during animation,
  // so the overlays can never block the login form even if GSAP is unavailable.
  // NOTE: no translate utility here — a CSS translate would be cached by GSAP as
  // pixels and keep the panel offset even after yPercent animates to 0.
  const paneBase = 'absolute inset-0 z-0 overflow-hidden'
  const paneScroller =
    'absolute inset-0 overflow-y-auto pb-[max(2.5rem,env(safe-area-inset-bottom,0px))]'
  const hiddenPaneBase = `${paneBase} invisible`
  const themeBg = isDark ? darkBg : lightBg
  const paneBackdrop = (
    <>
      {/* theme-aware artwork behind the sliding form panes */}
      <img
        src={themeBg}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      {/* scrim so the form text stays readable over the artwork */}
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${
          isDark
            ? 'from-black/70 via-black/60 to-black/80'
            : 'from-white/60 via-white/55 to-white/80'
        }`}
        aria-hidden
      />
    </>
  )

  return (
    <AuthShell strongBackdrop>
      {/* Login pane — always visible beneath the sliding panels */}
      <div className={paneBase}>
        <div data-pane-scroll className={`${paneScroller} relative flex flex-col justify-end pt-6`}>
          {/* tagline — sits just above the login card on every screen */}
          <p className="mb-6 text-center text-sm font-medium tracking-wide text-theme-primary drop-shadow-md md:text-base">
            {t('ride_anytime_anywhere')}
          </p>
          <LoginForm
            identifier={identifier}
            onIdentifierChange={handleIdentifierChange}
            password={password}
            onPasswordChange={setPassword}
            error={loginError}
            loading={loginLoading}
            accountState={accountState}
            checking={checkingAccount}
            onSubmit={submitLogin}
            onCheckAccount={checkAccount}
            onForgotVerified={completeAuth}
            onCreateAccount={() => setRegisterOpen(true)}
          />
        </div>
      </div>

      {/* Registration pane — slides up over the login pane */}
      <div ref={registerRef} className={`${hiddenPaneBase} z-10`} aria-hidden={!registerOpen}>
        {paneBackdrop}
        <div data-pane-scroll className={`${paneScroller} relative flex flex-col justify-end pt-6`}>
          <RegistrationForm
            draft={draft}
            onDraftChange={setDraft}
            onBack={() => setRegisterOpen(false)}
            onSendOtp={sendOtp}
            loading={regLoading}
            error={regError}
            duplicate={regDuplicate}
            onLoginInstead={goToLogin}
            emailReadOnly={Boolean(draft.email && accountState === 'new')}
          />
        </div>
      </div>

      {/* OTP pane — slides in over the registration panel */}
      <div ref={otpRef} className={`${hiddenPaneBase} z-20`} aria-hidden={!otpOpen}>
        {paneBackdrop}
        <div data-pane-scroll className={`${paneScroller} relative flex flex-col justify-end pt-6`}>
          <OtpVerification
            phone={draft.phone}
            email={draft.email}
            name={draft.name}
            signupPassword={draft.password}
            debugOtp={loginOtpIdentifier ? loginOtpDevOtp : regDebugOtp}
            loginIdentifier={loginOtpIdentifier}
            onBack={() => setOtpOpen(false)}
            onVerified={completeAuth}
          />
        </div>
      </div>
    </AuthShell>
  )
}

export default AuthScreen