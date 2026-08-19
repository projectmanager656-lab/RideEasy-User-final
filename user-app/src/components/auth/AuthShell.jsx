import React, { useRef, useState } from 'react'
import { useLanguage, LANGUAGE_OPTIONS } from '../../i18n'
import welcomeBg from '../../assets/rideeasy-welcome.png'

const BrandLogo = () => (
  <p className="text-3xl font-black tracking-tight">
    <span className="text-white">Ride</span>
    <span className="text-brand">Easy</span>
  </p>
)

/**
 * Full-screen auth layout: night-city hero, RideEasy branding,
 * language selector and a scrollable stage for the auth panes.
 */
const AuthShell = ({ children, hideHeaderSub = false, strongBackdrop = false }) => {
  const { t, language, setLanguage } = useLanguage()
  const [ langOpen, setLangOpen ] = useState(false)
  const langRef = useRef(null)

  const toggle = () => setLangOpen((open) => !open)

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-night-950 text-white">
      {/* full-screen welcome artwork */}
      <img
        src={welcomeBg}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
      />
      {strongBackdrop ? (
        /* Login: extra bottom gradient so the card area stays clean. */
        <div
          className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-night-950 to-transparent"
          aria-hidden
        />
      ) : (
        /* Welcome: light bottom gradient so the Get started button pops. */
        <div
          className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-night-950/85 via-night-950/40 to-transparent"
          aria-hidden
        />
      )}

      {/* header: branding + language selector — hidden on the welcome page */}
      {!hideHeaderSub && (
      <header className="relative z-30 flex shrink-0 items-center justify-between px-6 pt-6">
        <div>
          <BrandLogo />
          {!hideHeaderSub && <p className="mt-1 text-sm text-zinc-400">{t('welcome_hero_sub')}</p>}
        </div>
        <div className="relative" ref={langRef}>
          <button
            type="button"
            onClick={toggle}
            aria-haspopup="listbox"
            aria-expanded={langOpen}
            className="flex items-center gap-1.5 rounded-full border border-night-border bg-night-800 px-3 py-1.5 text-xs font-bold text-zinc-300 transition hover:border-zinc-600"
          >
            <i className="ri-translate-2" aria-hidden />
            {LANGUAGE_OPTIONS.find(o => o.code === language)?.label}
            <i className={`ri-arrow-down-s-line transition-transform ${langOpen ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {langOpen && (
            <div
              role="listbox"
              className="absolute right-0 z-20 mt-2 w-32 overflow-hidden rounded-xl border border-night-border bg-night-900 shadow-2xl"
            >
              {LANGUAGE_OPTIONS.map(opt => (
                <button
                  type="button"
                  key={opt.code}
                  role="option"
                  aria-selected={opt.code === language}
                  onClick={() => { setLanguage(opt.code); setLangOpen(false) }}
                  className={`w-full px-3 py-2 text-left text-xs transition hover:bg-night-800 ${opt.code === language ? 'bg-brand/10 font-bold text-brand' : 'text-zinc-300'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
      )}

      {/* scrollable stage for the auth panes */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col">
        {/* welcome branding — RideEasy + tagline, sits middle-top */}
        {hideHeaderSub && (
          <div className="pointer-events-none absolute inset-x-0 top-[22%] z-10 flex flex-col items-center gap-2 text-center">
            <BrandLogo />
            <p className="text-sm font-medium tracking-wide text-white/95 drop-shadow-md md:text-base">
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