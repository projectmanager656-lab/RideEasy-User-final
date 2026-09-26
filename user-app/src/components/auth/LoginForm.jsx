import React, { useState } from 'react'
import { useLanguage } from '../../i18n'
import { apiClient } from '../../services/http'
import { formatApiError } from '../../utils/apiError'
import { stripApiEnvelope } from '../../utils/apiBody'
import { inputBase, labelClass, errorBoxClass } from './classes'
import AuthButton from './AuthButton'
import PasswordInput from './PasswordInput'
import PhoneInput from './PhoneInput'
import OtpInputs from './OtpInputs'
import OtpVerification from './OtpVerification'
import SocialLoginButtons from './SocialLoginButtons'
import { useCountdown } from './useCountdown'

/**
 * Smart login: the email/phone is checked against the backend first.
 * - Account exists  → password + Login are revealed (existing user).
 * - No account      → the registration panel auto-opens (new user).
 * The explicit "Create account" link also opens registration.
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
  onCreateAccount,
}) => {
  const { t } = useLanguage()
  const [ forgotOpen, setForgotOpen ] = useState(false)
  const [ forgotPhone, setForgotPhone ] = useState('')
  const [ otp, setOtp ] = useState('')
  const [ otpSent, setOtpSent ] = useState(false)
  const [ otpLoading, setOtpLoading ] = useState(false)
  const [ otpError, setOtpError ] = useState('')
  const [ devOtp, setDevOtp ] = useState('')
  // Forgot-password: new password chosen after the OTP is verified.
  const [ newPassword, setNewPassword ] = useState('')
  const [ confirmPassword, setConfirmPassword ] = useState('')
  const [ phoneLoginOpen, setPhoneLoginOpen ] = useState(false)
  const [ phoneLoginOtpOpen, setPhoneLoginOtpOpen ] = useState(false)
  const [ phoneLogin, setPhoneLogin ] = useState('')
  const [ phoneLoginError, setPhoneLoginError ] = useState('')
  const { secondsLeft, reset } = useCountdown(300)

  const canResend = secondsLeft === 0

  const startPhoneLogin = () => {
    const normalized = String(phoneLogin || '').replace(/\D/g, '').replace(/^91/, '')
    if (!/^[6-9]\d{9}$/.test(normalized)) {
      setPhoneLoginError(t('valid_phone_error'))
      return
    }
    setPhoneLogin(normalized)
    setPhoneLoginError('')
    setPhoneLoginOtpOpen(true)
  }

  const sendOtp = async () => {
    if (!/^[6-9]\d{9}$/.test(forgotPhone)) {
      setOtpError(t('valid_phone_error'))
      return
    }
    setOtpError('')
    setOtpLoading(true)
    try {
      const response = await apiClient.post('/users/phone/send-otp', { phone: forgotPhone })
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
    // A new password is required to reset the old (lost) one.
    if (newPassword.length < 6) {
      setOtpError(t('min_6_chars'))
      return
    }
    if (confirmPassword !== newPassword) {
      setOtpError(t('passwords_do_not_match'))
      return
    }
    setOtpError('')
    setOtpLoading(true)
    try {
      const response = await apiClient.post('/users/phone/verify-otp', {
        phone: forgotPhone,
        otp: String(otp).replace(/\D/g, ''),
        // The backend stores this as the account's new password.
        password: newPassword,
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
        <div className="rounded-2xl border border-theme bg-theme-card p-6 shadow-xl">
          <button
            type="button"
            onClick={() => setForgotOpen(false)}
            className="mb-4 flex items-center gap-2 text-sm font-medium text-theme-secondary transition hover:text-theme-primary"
          >
            <i className="ri-arrow-left-line" aria-hidden />
            {t('back_to_login')}
          </button>
          <h2 className="text-xl font-semibold">{t('forgot_password')}</h2>
          <p className="mb-5 mt-1 text-sm text-theme-muted">
            {t('otp_sent_to_phone')} {t('reset_password_hint')}
          </p>
          {otpError ? <div role="alert" className={errorBoxClass}>{otpError}</div> : null}
          {devOtp ? (
            <button
              type="button"
              onClick={() => setOtp(String(devOtp).replace(/\D/g, '').slice(0, 6))}
              className="mb-4 w-full rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-center text-sm font-semibold text-brand transition hover:bg-brand/15"
              title="Tap to autofill"
            >
              Temporary OTP: {devOtp}
            </button>
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
                  <span className="text-sm text-theme-muted">
                    {t('resend_otp_in', { seconds: secondsLeft })}
                  </span>
                )}
              </div>
              {/* New password — required so this account can be logged into with it. */}
              <div className="mb-4">
                <PasswordInput
                  value={newPassword}
                  onChange={setNewPassword}
                  label={t('create_password')}
                  placeholder={t('enter_password')}
                  autoComplete="new-password"
                  name="forgot-new-password"
                />
              </div>
              <div className="mb-4">
                <PasswordInput
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  label={t('confirm_password')}
                  placeholder={t('confirm_new_password')}
                  autoComplete="new-password"
                  name="forgot-confirm-password"
                />
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

  if (phoneLoginOtpOpen) {
    return (
      <OtpVerification
        loginIdentifier={phoneLogin}
        phoneLogin
        autoSend
        onBack={() => setPhoneLoginOtpOpen(false)}
        onVerified={onForgotVerified}
      />
    )
  }

  if (phoneLoginOpen) {
    return (
      <div className="mx-auto w-full max-w-md px-6 pb-10">
        <div className="rounded-2xl border border-theme bg-theme-card p-6 shadow-xl">
          <button type="button" onClick={() => setPhoneLoginOpen(false)} className="mb-4 flex items-center gap-2 text-sm font-medium text-theme-secondary">
            <i className="ri-arrow-left-line" aria-hidden /> {t('back_to_login')}
          </button>
          <h2 className="text-xl font-semibold">{t('phone')} {t('login')}</h2>
          {phoneLoginError ? <div role="alert" className={errorBoxClass}>{phoneLoginError}</div> : null}
          <PhoneInput value={phoneLogin} onChange={setPhoneLogin} label={t('phone')} placeholder={t('enter_phone')} name="phone-login" />
          <AuthButton onClick={startPhoneLogin}>{t('send_otp')}</AuthButton>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md px-6 pb-10">
      <h1 className="text-2xl font-bold">{t('welcome_back')}</h1>
      <p className="mb-6 mt-1 text-sm text-theme-secondary">{t('sign_in_continue')}</p>

      <div className="rounded-2xl border border-theme bg-theme-card p-6 shadow-xl">
        <form onSubmit={onSubmit} noValidate>
          {error ? <div role="alert" className={errorBoxClass}>{error}</div> : null}
          <div className="mb-4">
            <label htmlFor="auth-identifier" className={labelClass}>{t('email')} <span className="text-red-500" aria-hidden>*</span></label>
            <input
              id="auth-identifier"
              name="identifier"
              required
              type="text"
              inputMode="email"
              autoComplete="username"
              className={inputBase}
              placeholder={t('enter_email')}
              value={identifier}
              onChange={(e) => onIdentifierChange(e.target.value)}
              onBlur={(e) => {
                const id = String(e.target.value || '').trim()
                if (id.length >= 3 && accountState === 'unknown') onCheckAccount(id)
              }}
            />
          </div>

          {checking ? (
            <div role="status" className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-theme-card-muted px-4 py-3 text-sm text-theme-secondary">
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
                label={t('password')}
                placeholder={t('enter_password')}
              />
              <div className="mb-5 -mt-2 text-right">
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-sm font-semibold text-brand hover:text-brand-light"
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

        <SocialLoginButtons onAuthenticated={onForgotVerified} onPhoneLogin={() => setPhoneLoginOpen(true)} />
      </div>

      <p className="mt-6 text-center text-sm text-theme-secondary">
        {t('create_new_account')}{' '}
        <button
          type="button"
          onClick={onCreateAccount}
          className="font-bold text-brand hover:text-brand-light"
        >
          {t('create_account')}
        </button>
      </p>
    </div>
  )
}

export default LoginForm
