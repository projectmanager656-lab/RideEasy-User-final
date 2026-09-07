import React from 'react'
import { useLanguage } from '../../i18n'
import { inputBase, labelClass } from './classes'

/**
 * Indian mobile number field with a fixed +91 country-code prefix.
 * Outputs only the 10-digit number (no duplicated country codes).
 */
const PhoneInput = ({
  value,
  onChange,
  label,
  placeholder,
  name = 'phone',
  required = true,
}) => {
  const { t } = useLanguage()

  const handleChange = (raw) => {
    const digits = String(raw || '').replace(/\D/g, '')
    const cleaned = digits.length === 12 && digits.startsWith('91')
      ? digits.slice(2)
      : digits
    onChange(cleaned.slice(0, 10))
  }

  return (
    <div className="mb-4">
      {label ? <label htmlFor={name} className={labelClass}>{label}</label> : null}
      <div className="relative">
        <span
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-medium text-theme-secondary"
          aria-hidden
        >
          {t('country_code')}
        </span>
        <input
          id={name}
          name={name}
          required={required}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          className={`${inputBase} pl-14`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
        />
      </div>
    </div>
  )
}

export default PhoneInput
