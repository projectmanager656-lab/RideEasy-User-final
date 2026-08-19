import React, { useState } from 'react'
import { useLanguage } from '../../i18n'
import { inputBase, labelClass } from './classes'

/**
 * Password field with show/hide toggle, hidden by default.
 * Accessible label + correct autocomplete hints.
 */
const PasswordInput = ({
  value,
  onChange,
  placeholder,
  label,
  autoComplete = 'current-password',
  name = 'password',
  required = true,
}) => {
  const { t } = useLanguage()
  const [ visible, setVisible ] = useState(false)

  return (
    <div className="mb-4">
      {label ? <label htmlFor={name} className={labelClass}>{label}</label> : null}
      <div className="relative">
        <input
          id={name}
          name={name}
          required={required}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          className={`${inputBase} pr-12`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t('password_hide') : t('password_show')}
          aria-pressed={visible}
          className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200"
        >
          <i className={`ri-${visible ? 'eye-off' : 'eye'}-line text-xl`} aria-hidden />
        </button>
      </div>
    </div>
  )
}

export default PasswordInput