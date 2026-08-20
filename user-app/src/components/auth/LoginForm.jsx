import React, { useState } from 'react'
import { useLanguage } from '../../i18n'
import { sendPhoneOtp, verifyPhoneOtp } from '../../services/authService'
import { formatApiError } from '../../utils/apiError'
import { stripApiEnvelope } from '../../utils/apiBody'
import { inputBase, labelClass, errorBoxClass } from './classes'
import AuthButton from './AuthButton'
import PasswordInput from './PasswordInput'
import PhoneInput from './PhoneInput'
import OtpInputs from './OtpInputs'
import SocialLoginButtons from './SocialLoginButtons'
import { useCountdown } from './useCountdown'

/**
 * Smart login: the email/phone is checked against the backend first.
 * - Account exists  → password + Login are revealed (existing user).
 * - No account      → the registration panel auto-opens (new user).
 * There is deliberately NO "Sign up" button/link: the flow is automatic.
 */
const LoginForm = ({
  identifier,
  onIdentifierChange,
  password,
  onPasswordChange,
  error,
  loading,
  accountState,
  checking,
  onSubmit,
  onCheckAccount,
  onForgotVerified,
}) => {
  const { t } = useLanguage()
  const [ forgotOpen, setForgotOpen ] = useState(false)
  const [ forgotPhone, setForgotPhone ] = useState('')
  const [ otp, setOtp ] = useState('')
  const [ otpSent, setOtpSent ] = useState(false)
  const [ otpLoading, setOtpLoading ] = useState(false)
  const [ otpError, setOtpError ] = useState('')
  const [ devOtp, setDevOtp ] = useState('')
  const { secondsLeft, reset } = useCountdown(300)

  const canResend = secondsLeft === 0

  const sendOtp = async () => {
    if (!/^[6-9]\d{9}$/.test(forgotPhone)) {
      setOtpError(t('valid_phone_error'))
      return
    }
    setOtpError('')
    setOtpLoading(true)
    try {
      const response = await sendPhoneOtp({ phone: forgotPhone })
      const data = stripApiEnvelope(response.data)
      if (data?.debugOtp) setDevOtp(String(data.debugOtp))
      setOtp('')
      setOtpSent(true)
      reset(300)
    } catch (err) {
      setOtpError(formatApiError(err))
    } finally {
      setOtpLoading(false)
    }
  }

  const verifyOtp = async () => {
    if (String(otp).replace(/\D/g, '').length !== 6) return
    setOtpError('')
    setOtpLoading(true)
    try {
      const response = await verifyPhoneOtp({
        phone: forgotPhone,
        otp: String(otp).replace(/\D/g, ''),
      })
      const data = stripApiEnvelope(response.data)
      const user = data?.user ?? data
      const token = data?.token
      if (user && token) {
        onForgotVerified(token, user)
      } else {
        setOtpError(t('otp_error'))
      }
    } catch (err) {
      setOtpError(formatApiError(err))
    } finally {
      setOtpLoading(false)
    }
  }

  if (forgotOpen) {
    return (
      <div className="mx-auto w-full max-w-md px-6 pb-10">
        <div className="rounded-2xl border border-night-border bg-night-900 p-6 shadow-xl">
          <button
            type="button"
            onClick={() => setForgotOpen(false)}
            className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-400 transition hover:text-white"
          >
            <i className="ri-arrow-left-line" aria-hidden />
            {t('back_to_login')}
          </button>
          <h2 className="text-xl font-semibold">{t('forgot_password')}</h2>
          <p className="mb-5 mt-1 text-sm text-zinc-500">
            {t('otp_sent_to_phone')}
          </p>
          {otpError ? <div role="alert" className={errorBoxClass}>{otpError}</div> : null}
          {import.meta.env.DEV && devOtp ? (
            <p className="mb-4 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-center text-sm font-semibold text-brand">
              Dev OTP: {devOtp}
            </p>
          ) : null}
          {!otpSent ? (
            <>
              <PhoneInput
                value={forgotPhone}
                onChange={setForgotPhone}
                label={t('phone')}
                placeholder={t('enter_phone')}
                name="forgot-phone"
              />
              <AuthButton loading={otpLoading} onClick={sendOtp}>
                {otpLoading ? t('sending_otp') : t('send_otp')}
              </AuthButton>
            </>
          ) : (
            <>
              <div className="mb-5">
                <OtpInputs otp={otp} onChange={setOtp} disabled={otpLoading} />
              </div>
              <div className="mb-5 text-center">
                {canResend ? (
                  <button
                    type="button"
                    onClick={sendOtp}
                    disabled={otpLoading}
                    className="text-sm font-semibold text-brand hover:text-brand-light disabled:opacity-60"
                  >
                    {t('resend_otp')}
                  </button>
                ) : (
                  <span className="text-sm text-zinc-500">
                    {t('resend_otp_in', { seconds: secondsLeft })}
                  </span>
                )}
              </div>
              <AuthButton
                loading={otpLoading}
                disabled={String(otp).replace(/\D/g, '').length !== 6}
                onClick={verifyOtp}
              >
                {otpLoading ? t('verifying') : t('verify_continue')}
              </AuthButton>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md px-6 pb-10">
      <h1 className="text-2xl font-bold">{t('welcome_back')}</h1>
      <p className="mb-6 mt-1 text-sm text-zinc-400">{t('sign_in_continue')}</p>

      <div className="rounded-2xl border border-night-border bg-night-900 p-6 shadow-xl">
        <form onSubmit={onSubmit} noValidate>
          {error ? <div role="alert" className={errorBoxClass}>{error}</div> : null}
          <div className="mb-4">
            <label htmlFor="auth-identifier" className={labelClass}>{t('email_or_phone')}</label>
            <input
              id="auth-identifier"
              name="identifier"
              required
              type="text"
              inputMode="email"
              autoComplete="username"
              className={inputBase}
              placeholder={t('email_or_phone_ph')}
              value={identifier}
              onChange={(e) => onIdentifierChange(e.target.value)}
              onBlur={(e) => {
                const id = String(e.target.value || '').trim()
                if (id.length >= 3 && accountState === 'unknown') onCheckAccount(id)
              }}
            />
          </div>

          {checking ? (
            <div role="status" className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-night-800 px-4 py-3 text-sm text-zinc-300">
              <i className="ri-loader-4-line animate-spin text-brand" aria-hidden />
              {t('checking_account')}
            </div>
          ) : null}

          {!checking && accountState === 'new' ? (
            <div role="status" className="mb-4 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-brand">
              <span className="font-bold">{t('new_account_detected')}.</span>{' '}
              {t('lets_create_your_account')}
            </div>
          ) : null}

          {!checking && accountState === 'existing' ? (
            <>
              <PasswordInput
                value={password}
                onChange={onPasswordChange}
                placeholder={t('password')}
              />
              <div className="mb-5 -mt-2 text-right">
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-sm font-medium text-brand hover:text-brand-light"
                >
                  {t('forgot_password')}
                </button>
              </div>
            </>
          ) : null}

          {accountState === 'existing' ? (
            <AuthButton loading={loading}>
              {loading ? t('logging_in_dots') : t('login')}
            </AuthButton>
          ) : (
            <AuthButton loading={checking} disabled={checking}>
              {checking ? t('checking_account') : t('account_continue')}
            </AuthButton>
          )}
        </form>

        <SocialLoginButtons onAuthenticated={onForgotVerified} />
      </div>
    </div>
  )
}

export default LoginForm