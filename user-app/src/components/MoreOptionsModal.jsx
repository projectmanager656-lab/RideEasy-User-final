import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../i18n'

const Svg = ({ children, className = 'h-4 w-4' }) => (
    <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
    >
        {children}
    </svg>
)

const OPTIONS = [
    {
        id: 'student',
        labelKey: 'student_ride',
        noteKey: 'coming_soon',
        icon: (
            <Svg>
                <path d="M2 9l10-5 10 5-10 5-10-5Z" />
                <path d="M6 11.5V15c0 1.5 2.7 3 6 3s6-1.5 6-3v-3.5" />
                <path d="M22 9v4" />
            </Svg>
        ),
    },
    {
        id: 'parcel',
        labelKey: 'parcel',
        noteKey: 'coming_soon',
        icon: (
            <Svg>
                <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
                <path d="M3 8l9 5 9-5M12 13v8" />
            </Svg>
        ),
    },
]

/** Linkable options added to the More menu. */
const NAV_OPTIONS = [
    {
        id: 'safety',
        labelKey: 'safety',
        detailKey: 'emergency_trip_safety',
        to: '/safety',
        icon: 'ri-shield-check-line',
    },
    {
        id: 'help',
        labelKey: 'help_support',
        detailKey: 'get_help_with_ride',
        to: '/help',
        icon: 'ri-customer-service-2-line',
    },
    {
        id: 'faq',
        labelKey: 'frequently_asked_questions',
        detailKey: 'common_questions_answered',
        to: '/faq',
        icon: 'ri-question-answer-line',
    },
]

const MoreOptionsModal = ({ open, onClose }) => {
    const navigate = useNavigate()
    const { t } = useLanguage()

    if (!open) return null

    const go = (to) => {
        onClose()
        navigate(to)
    }

    return (
        <div className="absolute inset-0 z-40 flex flex-col justify-end">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
                onClick={onClose}
                aria-hidden
            />
            <div className="relative max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-theme bg-theme-card p-4">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-theme-muted" />
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-base font-bold text-theme-primary">{t('more_services')}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full border border-theme bg-theme-card px-2.5 py-1 text-xs text-theme-secondary active:scale-95"
                    >
                        {t('close')}
                    </button>
                </div>

                {/* Safety & Help */}
                <div className="space-y-2">
                    {NAV_OPTIONS.map((o) => (
                        <button
                            key={o.id}
                            type="button"
                            onClick={() => go(o.to)}
                            className="flex w-full items-center gap-3 rounded-xl border border-theme bg-theme-card px-3.5 py-3 text-left transition hover:border-brand-yellow/40 active:scale-[0.99]"
                        >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
                                <i className={`${o.icon} text-lg`} aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-theme-primary">{t(o.labelKey)}</span>
                                <span className="block text-xs text-theme-secondary">{t(o.detailKey)}</span>
                            </span>
                            <i className="ri-arrow-right-s-line text-xl text-theme-muted" aria-hidden />
                        </button>
                    ))}
                </div>

                <div className="my-4 h-px bg-theme-border" />

                <div className="space-y-2">
                    {OPTIONS.map((o) => (
                        <div
                            key={o.id}
                            className="flex items-center justify-between rounded-xl border border-theme bg-theme-card px-3.5 py-3"
                        >
                            <span className="flex items-center gap-3 text-sm font-semibold text-theme-primary">
                                <span className="text-brand-yellow">{o.icon}</span>
                                {t(o.labelKey)}
                            </span>
                            <span className="rounded-full border border-theme px-2 py-0.5 text-[10px] uppercase tracking-wide text-theme-muted">
                                {t(o.noteKey)}
                            </span>
                        </div>
                    ))}
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    className="mt-4 w-full rounded-xl border border-theme bg-theme-card py-3 text-sm font-semibold text-theme-primary transition active:scale-[0.98]"
                >
                    {t('done')}
                </button>
            </div>
        </div>
    )
}

export default MoreOptionsModal
