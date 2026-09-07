import React, { useRef } from 'react'

/**
 * 6-digit OTP entry with:
 *  - automatic focus to the first field
 *  - auto-advance after each digit
 *  - backspace moves to the previous field
 *  - paste support
 *  - numeric keyboard on mobile
 */
const OtpInputs = ({ otp, onChange, disabled = false }) => {
  const refs = useRef([])
  const digits = Array.from({ length: 6 })

  const focusIndex = (i) => {
    const el = refs.current[i]
    if (el) el.focus()
  }

  const handleChange = (i, raw) => {
    const cleaned = String(raw).replace(/\D/g, '')
    const chars = otp.split('')
    if (cleaned) {
      for (let k = 0; k < cleaned.length && i + k < 6; k++) {
        chars[i + k] = cleaned[k]
      }
    } else {
      chars[i] = ''
    }
    onChange(chars.join(''))
    focusIndex(Math.min(i + cleaned.length, 5))
  }

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      e.preventDefault()
      onChange(otp.slice(0, i - 1) + otp.slice(i))
      focusIndex(i - 1)
    }
  }

  const handlePaste = (i, e) => {
    const text = e.clipboardData.getData('text')
    const cleaned = String(text).replace(/\D/g, '').slice(0, 6)
    if (!cleaned) return
    e.preventDefault()
    const next = otp.slice(0, i) + cleaned + otp.slice(i + cleaned.length)
    onChange(next.slice(0, 6))
    focusIndex(Math.min(i + cleaned.length, 5))
  }

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="OTP">
      {digits.map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          disabled={disabled}
          value={otp[i] || ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          aria-label={`OTP digit ${i + 1}`}
          className="h-14 w-full max-w-[52px] rounded-xl border border-theme bg-theme-input text-center text-2xl font-semibold text-theme-primary caret-brand focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/60 disabled:opacity-60 transition-colors"
        />
      ))}
    </div>
  )
}

export default OtpInputs
