import React, { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../i18n'
import { apiClient } from '../../services/http'
import { formatApiError } from '../../utils/apiError'
import { stripApiEnvelope } from '../../utils/apiBody'
import { dividerClass } from './classes'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
    <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.17 3.57-8.81Z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.14-4.06 1.14-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A11.99 11.99 0 0 0 12 24Z" />
    <path fill="#FBBC05" d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.29a12 12 0 0 0 0 10.76l4-3.1Z" />
    <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.94 1.19 15.24 0 12 0A11.99 11.99 0 0 0 1.29 6.62l4 3.1C6.23 6.88 8.88 4.77 12 4.77Z" />
  </svg>
)

const AppleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
    <path d="M17.05 12.54c-.03-2.4 1.96-3.55 2.05-3.6-1.12-1.63-2.86-1.86-3.48-1.88-1.48-.15-2.89.87-3.64.87-.75 0-1.9-.85-3.13-.83-1.61.02-3.1.94-3.93 2.38-1.67 2.9-.43 7.2 1.2 9.55.8 1.15 1.75 2.45 3 2.4 1.2-.05 1.66-.78 3.12-.78s1.87.78 3.14.75c1.3-.02 2.12-1.17 2.91-2.33.92-1.34 1.3-2.64 1.32-2.7-.03-.02-2.52-.97-2.56-3.83ZM14.6 4.9c.66-.8 1.1-1.92.98-3.03-.95.04-2.1.63-2.78 1.43-.61.7-1.15 1.83-1 2.9 1.06.09 2.14-.5 2.8-1.3Z" />
  </svg>
)

const socialBase =
  'flex min-h-[48px] w-full items-center justify-center gap-3 rounded-xl border border-night-border bg-night-800 px-4 py-3 text-sm font-semibold text-white transition hover:border-zinc-600 hover:bg-night-700 active:scale-[0.99]'

let gisPromise = null
function loadGoogleIdentity() {
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const existing = document.getElementById('google-gsi-script')
      if (existing) return resolve(window.google)
      const s = document.createElement('script')
      s.id = 'google-gsi-script'
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      s.onload = () => resolve(window.google)
      s.onerror = () => reject(new Error('gsi load failed'))
      document.head.appendChild(s)
    })
  }
  return gisPromise
}

/**
 * Google / Apple login buttons.
 * Google uses Google Identity Services (popup). The backend verifies the ID
 * token and creates/links the account. Apple login requires Apple Developer
 * credentials, so it stays as a notice until configured.
 */
const SocialLoginButtons = ({ onAuthenticated }) => {
  const { t } = useLanguage()
  const [ notice, setNotice ] = useState('')
  const googleSlotRef = useRef(null)
  const noticeTimer = useRef(null)

  const showNotice = (msg) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice(msg)
    noticeTimer.current = setTimeout(() => setNotice(''), 6000)
  }

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
  }, [])

  // Render Google's own branded button once GIS is ready.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleSlotRef.current) return
    let cancelled = false
    loadGoogleIdentity()
      .then((google) => {
        if (cancelled) return
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          auto_select: false,
          ux_mode: 'popup',
          callback: async (response) => {
            if (!response?.credential) {
              showNotice(t('google_login_failed'))
              return
            }
            setNotice('')
            try {
              const api = await apiClient.post('/users/google', { idToken: response.credential })
              const data = stripApiEnvelope(api.data)
              const user = data?.user ?? data
              const token = data?.token
              if (user && token) {
                onAuthenticated?.(token, user)
              } else {
                showNotice(t('google_login_failed'))
              }
            } catch (err) {
              showNotice(formatApiError(err))
            }
          },
        })
        google.accounts.id.renderButton(googleSlotRef.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          shape: 'rect',
          width: 400,
          text: 'continue_with',
          locale: 'en',
        })
      })
      .catch(() => {
        if (!cancelled) showNotice(t('google_login_failed'))
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleGoogleFallback = async () => {
    if (!GOOGLE_CLIENT_ID) {
      showNotice(t('google_not_configured'))
      return
    }
    // GIS script still loading — retry render shortly after.
    setNotice('')
    loadGoogleIdentity()
      .then((google) => {
        google.accounts.id.prompt()
      })
      .catch(() => showNotice(t('google_login_failed')))
  }

  const handleApple = () => showNotice(`${t('continue_with_apple')}: ${t('social_login_unavailable')}`)

  return (
    <div>
      <div className={dividerClass}>
        <span className="h-px flex-1 bg-night-border" aria-hidden />
        <span>{t('or_continue_with')}</span>
        <span className="h-px flex-1 bg-night-border" aria-hidden />
      </div>
      <div className="grid grid-cols-1 gap-3">
        {GOOGLE_CLIENT_ID ? (
          <div ref={googleSlotRef} className="flex min-h-[48px] w-full items-center justify-center [&>div]:!w-full" />
        ) : (
          <button type="button" className={socialBase} onClick={handleGoogleFallback}>
            <GoogleIcon />
            <span>{t('continue_with_google')}</span>
          </button>
        )}
        <button type="button" className={socialBase} onClick={handleApple}>
          <AppleIcon />
          <span>{t('continue_with_apple')}</span>
        </button>
      </div>
      {notice ? (
        <p role="status" className="mt-3 text-center text-xs text-zinc-500">{notice}</p>
      ) : null}
    </div>
  )
}

export default SocialLoginButtons