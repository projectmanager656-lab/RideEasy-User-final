import React, { useEffect, useRef } from 'react'
import { useLanguage } from '../../i18n'
import { useTheme } from '../../context/ThemeContext'
import ThemeSelector from '../ThemeSelector'
import LanguageSelector from '../LanguageSelector'
import lightBg from '../../assets/white.png'
import darkBg from '../../assets/black.png'

const BrandLogo = ({ tone = 'primary' }) => (
  <p className="text-3xl font-black tracking-tight">
    <span className={tone === 'light' ? 'text-black' : 'text-white'}>Ride</span>
    <span className="text-brand">Easy</span>
  </p>
)

/**
 * Full-screen theme-aware auth layout:
 *  - The chosen theme artwork fills the whole screen:
 *      light theme → white.png
 *      dark theme  → black.png
 *  - Welcome (hideHeaderSub) keeps its branding overlay.
 *  - Login / registration / OTP (strongBackdrop) keep the same artwork behind
 *    the translucent forms — it switches live when the theme is changed.
 */
const AuthShell = ({ children, hideHeaderSub = false, strongBackdrop = false }) => {
  const { t } = useLanguage()
  const { isDark } = useTheme()

  const bg = isDark ? darkBg : lightBg

  /**
   * Android keyboard handling for the auth forms only (not global).
   * The WebView resizes via adjustResize, so the auth pane scroller has already
   * shrunk when the keyboard appears. We wait for that resize to settle, then bring
   * the focused field into view. `block: "center"` avoids jumping when the field is
   * already visible, and the timer reset prevents repeated aggressive scrolling.
   */
  const focusScrollTimer = useRef(null)
  const handleFocusCapture = (event) => {
    const el = event.target
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return
    clearTimeout(focusScrollTimer.current)
    focusScrollTimer.current = setTimeout(() => {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      } catch {
        el.scrollIntoView()
      }
    }, 300)
  }
  useEffect(() => () => clearTimeout(focusScrollTimer.current), [])

  return (
    /*
     * overflow-clip (not overflow-hidden): hidden still creates a programmatically
     * scrollable box, and the browser scrolls it to reveal a focused input — which
     * dragged the RideEasy header up when the Android keyboard opened. clip never
     * creates a scroll container, so the header/nav stay completely stationary.
     */
    <div className="relative flex h-full flex-col overflow-clip bg-theme-bg text-theme-primary">
      {/* full-screen theme-aware artwork */}
      <img
        src={bg}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
      />

      {strongBackdrop ? (
        /* Login / auth forms: bottom gradient so the card area stays clean. */
        <div
          className={`absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t ${
            isDark ? 'from-black to-transparent' : 'from-white to-transparent'
          }`}
          aria-hidden
        />
      ) : (
        /* Welcome: light bottom gradient so the Get started button pops. */
        <div
          className={`absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t ${
            isDark
              ? 'from-black/90 via-black/40 to-transparent'
              : 'from-white/90 via-white/40 to-transparent'
          }`}
          aria-hidden
        />
      )}

      {/* header: branding + theme + language selectors — hidden on welcome */}
      {!hideHeaderSub && (
        <header className="relative z-30 flex shrink-0 items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <BrandLogo tone={isDark ? 'dark' : 'light'} />
            <p className="mt-1 text-sm text-theme-secondary">{t('welcome_hero_sub')}</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeSelector variant="pill" />
            <LanguageSelector />
          </div>
        </header>
      )}

      {/* scrollable stage for the auth panes */}
      <main
        className="relative z-10 flex min-h-0 flex-1 flex-col overflow-clip"
        onFocusCapture={handleFocusCapture}
      >
        {/* welcome branding — RideEasy + tagline, sits middle-top */}
        {hideHeaderSub && (
          <div className="pointer-events-none absolute inset-x-0 top-[22%] z-10 flex flex-col items-center gap-2 text-center">
            <BrandLogo tone={isDark ? 'dark' : 'light'} />
            <p className="text-sm font-medium tracking-wide text-theme-primary drop-shadow-md md:text-base">
              {t('ride_anytime_anywhere')}
            </p>
          </div>
        )}
        {children}
      </main>
    </div>
  )
}

export default AuthShell
