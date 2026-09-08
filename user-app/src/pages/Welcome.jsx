import React, { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import gsap from 'gsap'
import AuthShell from '../components/auth/AuthShell'
import { useLanguage } from '../i18n'
import { markOnboardingComplete } from '../utils/onboarding'

/**
 * First-launch welcome screen: RideEasy branding, night-city hero art and a
 * swipe/tap gesture that transitions into the Login page. Shown only once —
 * after swiping, the flag is stored so future launches go straight to Login
 * (or Home when already authenticated).
 */
const Welcome = () => {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const rootRef = useRef(null)
  const touchStart = useRef(null)
  const leaving = useRef(false)

  const goToLogin = () => {
    if (leaving.current) return
    leaving.current = true
    markOnboardingComplete()
    gsap.to(rootRef.current, {
      xPercent: -100,
      autoAlpha: 0,
      scale: 0.96,
      duration: 0.45,
      ease: 'power2.inOut',
      onComplete: () => navigate('/login', { replace: true, state: { fromWelcome: true } }),
    })
  }

  const handleTouchStart = (e) => {
    const t = e.touches?.[0]
    if (t) touchStart.current = { x: t.clientX, y: t.clientY }
  }

  const handleTouchEnd = (e) => {
    const t = e.changedTouches?.[0]
    if (!t || !touchStart.current) return
    const dx = t.clientX - touchStart.current.x
    const dy = t.clientY - touchStart.current.y
    touchStart.current = null
    // Swipe left or up → Login.
    if (dx < -60 || dy < -60) goToLogin()
  }

  return (
    <div
      ref={rootRef}
      className="h-full"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <AuthShell hideHeaderSub>
        <div className="flex min-h-full flex-col justify-end px-6 pb-10 pt-2">
          {/* Get started — the background is blurred, so a real button is the
              primary tap target (swipe left also works). */}
          <button
            type="button"
            onClick={goToLogin}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-brand text-base font-bold text-brand-ink shadow-[0_8px_30px_rgba(255,168,0,0.25)] transition hover:bg-brand-light active:scale-[0.98]"
          >
            {t('get_started')}
            <i className="ri-arrow-right-line" aria-hidden />
          </button>
        </div>
      </AuthShell>
    </div>
  )
}

export default Welcome