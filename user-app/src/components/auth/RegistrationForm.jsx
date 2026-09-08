import React, { useState } from 'react'
import { useLanguage } from '../../i18n'
import { inputBase, labelClass, errorBoxClass } from './classes'
import AuthButton from './AuthButton'
import PhoneInput from './PhoneInput'
import PasswordInput from './PasswordInput'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * New-user registration panel: name, email, phone, password → Send OTP.
 * Password/confirm are captured here but OTP remains the activation path
 * (matches the backend phone OTP flow). Validates inline before any API call.
 */
const RegistrationForm = ({
  draft,
  onDraftChange,
  onBack,
  onSendOtp,
  loading,
  error,
  duplicate,
  onLoginInstead,
  emailReadOnly = false,
}) => {
  const { t } = useLanguage()
  const [ fieldErrors, setFieldErrors ] = useState({})
  const [ password, setPassword ] = useState('')
  const [ confirmPassword, setConfirmPassword ] = useState('')

  const set = (key) => (value) => onDraftChange({ ...draft, [key]: value })

  const handleSubmit = (e) => {
    e.preventDefault()
    const errors = {}
    const name = String(draft.name || '').trim()
    const email = String(draft.email || '').trim().toLowerCase()
    const phone = String(draft.phone || '').trim()

    if (name.length < 2) errors.name = t('valid_name_error')
    if (!EMAIL_RE.test(email)) errors.email = t('valid_email_error')
    if (!/^[6-9]\d{9}$/.test(phone)) errors.phone = t('valid_phone_error')
    if (password.length < 6) errors.password = t('min_6_chars')
    if (confirmPassword !== password) errors.confirmPassword = t('passwords_do_not_match')

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    // Carry the chosen password through the OTP flow so the backend can store
    // it on the account — otherwise login with this password would always fail.
    onSendOtp({ name, email, phone, password })
  }

  return (
    <div className="mx-auto w-full max-w-md px-6 pb-10">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-2 text-sm font-medium text-theme-secondary transition hover:text-theme-primary"
      >
        <i className="ri-arrow-left-line" aria-hidden />
        {t('back_to_login')}
      </button>

      <h1 className="text-2xl font-bold">{t('create_your_account')}</h1>
      <p className="mb-6 mt-1 text-sm text-theme-secondary">{t('fill_details_below')}</p>

      <div className="rounded-2xl border border-theme bg-theme-card p-6 shadow-xl">
        <form onSubmit={handleSubmit} noValidate>
          {error ? <div role="alert" className={errorBoxClass}>{error}</div> : null}
          {duplicate ? (
            <div role="alert" className={`${errorBoxClass} border-brand/40 bg-brand/10 text-brand`}>
              {t('account_exists')}
              <button
                type="button"
                onClick={onLoginInstead}
                className="mt-2 block w-full rounded-xl bg-brand px-4 py-2.5 text-center text-sm font-bold text-brand-ink transition hover:bg-brand-light"
              >
                {t('login')}
              </button>
            </div>
          ) : null}
          <div className="mb-4">
            <label htmlFor="reg-name" className={labelClass}>{t('full_name')}</label>
            <input
              id="reg-name"
              name="name"
              required
              type="text"
              autoComplete="name"
              className={`${inputBase} ${fieldErrors.name ? 'border-red-400 focus:border-red-500 focus:ring-red-500/50' : ''}`}
              placeholder={t('enter_full_name')}
              value={draft.name}
              onChange={(e) => set('name')(e.target.value)}
            />
            {fieldErrors.name ? <p className="mt-1 text-xs text-red-500">{fieldErrors.name}</p> : null}
          </div>
          <div className="mb-4">
            <label htmlFor="reg-email" className={labelClass}>{t('email')}</label>
            <input
              id="reg-email"
              name="email"
              required
              type="email"
              autoComplete="email"
              inputMode="email"
              readOnly={emailReadOnly}
              className={`${inputBase} ${emailReadOnly ? 'cursor-not-allowed opacity-70' : ''} ${fieldErrors.email ? 'border-red-400 focus:border-red-500 focus:ring-red-500/50' : ''}`}
              placeholder={t('enter_email')}
              value={draft.email}
              onChange={(e) => set('email')(e.target.value)}
            />
            {fieldErrors.email ? <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p> : null}
          </div>
          <PhoneInput
            value={draft.phone}
            onChange={set('phone')}
            label={t('phone')}
            placeholder={t('enter_phone')}
            name="reg-phone"
          />
          {fieldErrors.phone ? <p className="-mt-2 mb-3 text-xs text-red-500">{fieldErrors.phone}</p> : null}

          <PasswordInput
            value={password}
            onChange={setPassword}
            label={t('create_password')}
            placeholder={t('enter_password')}
            autoComplete="new-password"
            name="reg-password"
          />
          {fieldErrors.password ? <p className="-mt-2 mb-3 text-xs text-red-500">{fieldErrors.password}</p> : null}

          <PasswordInput
            value={confirmPassword}
            onChange={setConfirmPassword}
            label={t('confirm_password')}
            placeholder={t('confirm_new_password')}
            autoComplete="new-password"
            name="reg-confirm-password"
          />
          {fieldErrors.confirmPassword ? <p className="-mt-2 mb-3 text-xs text-red-500">{fieldErrors.confirmPassword}</p> : null}

          <AuthButton loading={loading}>
            {loading ? t('sending_otp') : t('create_account')}
          </AuthButton>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-theme-secondary">
        {t('register_login_hint')}{' '}
        <button
          type="button"
          onClick={onLoginInstead}
          className="font-bold text-brand hover:text-brand-light"
        >
          {t('login')}
        </button>
      </p>
    </div>
  )
}

export default RegistrationForm
