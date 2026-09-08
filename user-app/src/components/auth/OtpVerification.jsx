import React, { useState } from 'react'
import { useLanguage } from '../../i18n'
import { apiClient } from '../../services/http'
import { formatApiError } from '../../utils/apiError'
import { stripApiEnvelope } from '../../utils/apiBody'
import { errorBoxClass } from './classes'
import AuthButton from './AuthButton'
import OtpInputs from './OtpInputs'
import { useCountdown } from './useCountdown'

const maskPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length < 10) return digits
  return `${digits.slice(0, 5)} ${'•'.repeat(5)}`
}

const maskIdentifier = (id) => {
  const s = String(id || '').trim()
  const digits = s.replace(/[+\s-]/g, '')
  if (/^\d{10,}$/.test(digits)) return `+91 ${maskPhone(s)}`
  const [ local, domain ] = s.split('@')
  if (!domain) return s
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(3, Math.min(local.length - 2, 4)))}@${domain}`
}

/**
 * OTP verification step for new-user registration.
 * 6 digits (matching the backend), auto-advance, paste, countdown + resend.
 * On success the API returns a token → user is authenticated immediately.
 * When `loginIdentifier` is provided this switches to login-OTP mode.
 */
const OtpVerification = ({ phone, email, name, signupPassword = '', debugOtp, loginIdentifier, onBack, onVerified }) => {
  const { t } = useLanguage()
  const [ otp, setOtp ] = useState('')
  const [ loading, setLoading ] = useState(false)
  const [ error, setError ] = useState('')
  const [ resendNotice, setResendNotice ] = useState('')
  const [ devOtp, setDevOtp ] = useState('')
  const { secondsLeft, reset } = useCountdown(300)

  const isLogin = Boolean(loginIdentifier)
  const canResend = secondsLeft === 0
  const otpReady = String(otp).replace(/\D/g, '').length === 6
  const shownDevOtp = devOtp || debugOtp || ''

  const sendOtp = async () => {
    setError('')
    setResendNotice('')
    try {
      const response = await apiClient.post(
        isLogin ? '/users/login/send-otp' : '/users/phone/send-otp',
        isLogin
          ? { identifier: String(loginIdentifier).trim() }
          : {
              phone: String(phone).trim(),
              ...(email ? { email } : {}),
              ...(name ? { name } : {}),
            }
      )
      const data = stripApiEnvelope(response.data)
      if (data?.debugOtp) setDevOtp(String(data.debugOtp))
      reset(300)
      setResendNotice('sent')
    } catch (err) {
      setError(formatApiError(err))
    }
  }

  const verifyOtp = async () => {
    if (!otpReady || loading) return
    setError('')
    setLoading(true)
    try {
      const response = await apiClient.post(
        isLogin ? '/users/login/verify-otp' : '/users/phone/verify-otp',
        isLogin
          ? { identifier: String(loginIdentifier).trim(), otp: String(otp).replace(/\D/g, '') }
          : {
              phone: String(phone).trim(),
              otp: String(otp).replace(/\D/g, ''),
              ...(name ? { name } : {}),
              // Store the password chosen on the signup form so password login
              // works for this account (only during registration, never login-OTP).
              ...(signupPassword ? { password: signupPassword } : {}),
            }
      )
      const data = stripApiEnvelope(response.data)
      const user = data?.user ?? data
      const token = data?.token
      if (user && token) {
        onVerified(token, user)
      } else {
        setError(t('otp_error'))
      }
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-6 pb-10">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-2 text-sm font-medium text-theme-secondary transition hover:text-theme-primary"
      >
        <i className="ri-arrow-left-line" aria-hidden />
        {t(isLogin ? 'back_to_login' : 'back_to_registration')}
      </button>

      <h1 className="text-2xl font-bold">{t('verify_your_number')}</h1>
      <p className="mb-6 mt-1 text-sm text-theme-secondary">
        {t('otp_sent_to')}{' '}
        {isLogin ? maskIdentifier(loginIdentifier) : `+91 ${maskPhone(phone)}`}
      </p>

      <div className="rounded-2xl border border-theme bg-theme-card p-6 shadow-xl">
        {error ? <div role="alert" className={errorBoxClass}>{error}</div> : null}
        {resendNotice ? (
          <p role="status" className="mb-4 text-sm text-brand">{t('otp_sent')}</p>
        ) : null}
        {shownDevOtp ? (
          <button
            type="button"
            onClick={() => setOtp(String(shownDevOtp).replace(/\D/g, '').slice(0, 6))}
            className="mb-4 w-full rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-center text-sm font-semibold text-brand transition hover:bg-brand/15"
            title="Tap to autofill"
          >
            Temporary OTP: {shownDevOtp}
          </button>
        ) : null}
        <div className="mb-5">
          <OtpInputs otp={otp} onChange={setOtp} disabled={loading} />
        </div>
        <div className="mb-5 text-center">
          {canResend ? (
            <button
              type="button"
              onClick={sendOtp}
              disabled={loading}
              className="text-sm font-semibold text-brand hover:text-brand-light disabled:opacity-60"
            >
              {t('resend_otp')}
            </button>
          ) : (
            <span className="text-sm text-theme-muted">
              {t('resend_otp_in', { seconds: secondsLeft })}
            </span>
          )}
        </div>
        <AuthButton loading={loading} disabled={!otpReady} onClick={verifyOtp}>
          {loading ? t('verifying') : t('verify_continue')}
        </AuthButton>
      </div>
    </div>
  )
}

export default OtpVerification
