import React, { useRef, useState } from 'react'
import { useLanguage, LANGUAGE_OPTIONS } from '../i18n'

const LanguageSelector = ({ className = '' }) => {
  const { language, setLanguage } = useLanguage()
  const [ open, setOpen ] = useState(false)
  const ref = useRef(null)

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-theme bg-theme-card px-3 py-1.5 text-xs font-bold text-theme-primary transition hover:border-theme-strong"
      >
        <i className="ri-translate-2 text-sm" aria-hidden />
        {LANGUAGE_OPTIONS.find((o) => o.code === language)?.label}
        <i className={`ri-arrow-down-s-line text-sm transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-30 mt-2 w-32 overflow-hidden rounded-xl border border-theme bg-theme-card shadow-2xl"
        >
          {LANGUAGE_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.code}
              role="option"
              aria-selected={opt.code === language}
              onClick={() => { setLanguage(opt.code); setOpen(false) }}
              className={`w-full px-3 py-2 text-left text-xs transition hover:bg-theme-card-muted ${
                opt.code === language ? 'bg-brand/10 font-bold text-brand' : 'text-theme-secondary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default LanguageSelector
