import React, { useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { UserDataContext } from '../../context/UserContext'
import { checkUserExists, login, sendPhoneOtp } from '../../services/authService'
import { formatApiError } from '../../utils/apiError'
import { stripApiEnvelope } from '../../utils/apiBody'
import AuthShell from '../../components/auth/AuthShell'
import LoginForm from '../../components/auth/LoginForm'
import RegistrationForm from '../../components/auth/RegistrationForm'
import OtpVerification from '../../components/auth/OtpVerification'
import { markOnboardingComplete } from '../../utils/onboarding'
import { useLanguage } from '../../i18n'

/**
 * RideEasy authentication flow (smart detection):
 *   email/phone → /users/check-user → EXISTING → password → login verifies
 *                                              → OTP sent → verify → Home
 *                                  → NEW      → registration panel slides up
 *                                              → Send OTP → OTP verification
 *                                              → auto-authenticated → Home
 * There is no "Sign up" button: new users are detected automatically.
 */
const AuthScreen = ({ skipTokenRedirect = false }) => {
  const { t } = useLanguage()
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
  const [ accountState, setAccountState ] = useState('unknown')
  const [ checkingAccount, setCheckingAccount ] = useState(false)

  // registration state (shared between the registration + OTP panes)
  const [ draft, setDraft ] = useState({ name: '', email: '', phone: '' })
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
      navigate('/home', { replace: true })
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
          onComplete: () => { if (el) el.scrollTop = 0 },
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
          onComplete: () => { if (el) el.scrollTop = 0 },
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
    navigate('/home', { replace: true, state: location?.state })
  }

  const handleIdentifierChange = (value) => {
    setIdentifier(value)
    setAccountState('unknown')
    setLoginError('')
  }

  // Backend account lookup: decides the login vs auto-registration flow.
  const checkAccount = async (id) => {
    if (checkingAccount) return
    const cleanId = String(id || identifier || '').trim()
    if (cleanId.length < 3) return
    setCheckingAccount(true)
    setLoginError('')
    try {
      const response = await checkUserExists(cleanId)
      const data = stripApiEnvelope(response.data)
      if (data?.exists) {
        setAccountState('existing')
        return
      }
      // New user: auto-reveal registration with the identifier pre-filled.
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
    // Not yet classified → run the account check first.
    if (accountState !== 'existing') {
      await checkAccount(id)
      return
    }
    if (!password) return
    setLoginError('')
    setLoginLoading(true)
    try {
      const response = await login(id, password)
      const data = stripApiEnvelope(response.data)
      // Password verified → backend sent an OTP → open the OTP pane.
      if (data?.passwordVerified) {
        setLoginOtpIdentifier(id)
        setLoginOtpDevOtp(data?.debugOtp ? String(data.debugOtp) : '')
        setOtpOpen(true)
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
    try {
      const response = await sendPhoneOtp(payload)
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
    setAccountState('unknown')
    setPassword('')
    setOtpOpen(false)
    setRegisterOpen(false)
  }

  const paneBase =
    'absolute inset-0 z-0 overflow-y-auto pb-[max(2.5rem,env(safe-area-inset-bottom,0px))]'
  // CSS fallback hidden state — GSAP overrides these inline during animation,
  // so the overlays can never block the login form even if GSAP is unavailable.
  // NOTE: no translate utility here — a CSS translate would be cached by GSAP as
  // pixels and keep the panel offset even after yPercent animates to 0.
  const hiddenPaneBase = `${paneBase} invisible`

  return (
    <AuthShell strongBackdrop>
      {/* Login pane — always visible beneath the sliding panels */}
      <div className={paneBase}>
        <div className="flex min-h-full flex-col justify-end pt-6">
          {/* tagline — sits just above the login card on every screen */}
          <p className="mb-6 text-center text-sm font-medium tracking-wide text-white/95 drop-shadow-md md:text-base">
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
          />
        </div>
      </div>

      {/* Registration pane — slides up over the login pane */}
      <div ref={registerRef} className={`${hiddenPaneBase} z-10 bg-night-950 pt-6`} aria-hidden={!registerOpen}>
        <div className="flex min-h-full flex-col justify-end pt-6">
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
      <div ref={otpRef} className={`${hiddenPaneBase} z-20 bg-night-950 pt-6`} aria-hidden={!otpOpen}>
        <div className="flex min-h-full flex-col justify-end pt-6">
          <OtpVerification
            phone={draft.phone}
            email={draft.email}
            name={draft.name}
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