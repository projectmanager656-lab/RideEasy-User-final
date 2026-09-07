import React from 'react'
import { useTheme } from '../context/ThemeContext'
import { useLanguage } from '../i18n'

/**
 * RideEasy light/dark theme switch.
 * - variant "pill": compact auth-header toggle (current theme + sun/moon icon).
 * - variant "segmented": full Light / Dark selector used on the Account page.
 */
const ThemeSelector = ({ variant = 'pill', className = '' }) => {
  const { theme, setTheme } = useTheme()
  const { t } = useLanguage()

  if (variant === 'segmented') {
    const options = [
      { key: 'light', label: t('theme_light'), icon: 'ri-sun-line' },
      { key: 'dark', label: t('theme_dark'), icon: 'ri-moon-line' },
    ]
    return (
      <div
        className={`inline-flex items-stretch overflow-hidden rounded-full border border-theme bg-theme-card-muted p-1 ${className}`}
        role="radiogroup"
        aria-label={t('appearance')}
      >
        {options.map((opt) => {
          const active = theme === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(opt.key)}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-2 py-1.5 text-xs font-semibold transition-all focus:outline-none ${
                active
                  ? 'bg-brand text-brand-ink'
                  : 'text-theme-secondary hover:text-theme-primary'
              }`}
            >
              <i className={`${opt.icon} shrink-0 text-sm`} aria-hidden />
              <span className="truncate">{opt.label}</span>
            </button>
          )
        })}
      </div>
    )
  }

  const label = theme === 'light' ? t('theme_light') : t('theme_dark')
  const icon = theme === 'light' ? 'ri-sun-line' : 'ri-moon-line'
  return (
    <button
      type="button"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      aria-label={t('appearance')}
      className={`flex items-center gap-1.5 rounded-full border border-theme bg-theme-card px-3 py-1.5 text-xs font-bold text-theme-primary transition hover:border-theme-strong ${className}`}
    >
      <i className={`${icon} text-sm`} aria-hidden />
      {label}
    </button>
  )
}

export default ThemeSelector
