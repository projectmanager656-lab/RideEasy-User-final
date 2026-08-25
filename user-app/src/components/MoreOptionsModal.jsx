import React from 'react'
import { useNavigate } from 'react-router-dom'

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
        label: 'Student Ride',
        note: 'Coming soon',
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
        label: 'Parcel',
        note: 'Coming soon',
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
        label: 'Safety',
        detail: 'Emergency & trip safety',
        to: '/safety',
        icon: 'ri-shield-check-line',
    },
    {
        id: 'help',
        label: 'Help & Support',
        detail: 'Get help with your ride',
        to: '/help',
        icon: 'ri-customer-service-2-line',
    },
    {
        id: 'faq',
        label: 'Frequently Asked Questions',
        detail: 'Common questions answered',
        to: '/faq',
        icon: 'ri-question-answer-line',
    },
]

const MoreOptionsModal = ({ open, onClose }) => {
    const navigate = useNavigate()

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
            <div className="relative max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-brand-border bg-[#101010] p-4">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-700" />
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-base font-bold text-white">More services</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full border border-brand-border bg-brand-card px-2.5 py-1 text-xs text-zinc-400 active:scale-95"
                    >
                        Close
                    </button>
                </div>

                {/* Safety & Help */}
                <div className="space-y-2">
                    {NAV_OPTIONS.map((o) => (
                        <button
                            key={o.id}
                            type="button"
                            onClick={() => go(o.to)}
                            className="flex w-full items-center gap-3 rounded-xl border border-brand-border bg-brand-card px-3.5 py-3 text-left transition hover:border-brand-yellow/40 active:scale-[0.99]"
                        >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
                                <i className={`${o.icon} text-lg`} aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-white">{o.label}</span>
                                <span className="block text-xs text-zinc-400">{o.detail}</span>
                            </span>
                            <i className="ri-arrow-right-s-line text-xl text-zinc-500" aria-hidden />
                        </button>
                    ))}
                </div>

                <div className="my-4 h-px bg-brand-border" />

                <div className="space-y-2">
                    {OPTIONS.map((o) => (
                        <div
                            key={o.id}
                            className="flex items-center justify-between rounded-xl border border-brand-border bg-brand-card px-3.5 py-3"
                        >
                            <span className="flex items-center gap-3 text-sm font-semibold text-white">
                                <span className="text-brand-yellow">{o.icon}</span>
                                {o.label}
                            </span>
                            <span className="rounded-full border border-brand-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                                {o.note}
                            </span>
                        </div>
                    ))}
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    className="mt-4 w-full rounded-xl border border-brand-border bg-brand-card py-3 text-sm font-semibold text-white transition active:scale-[0.98]"
                >
                    Done
                </button>
            </div>
        </div>
    )
}

export default MoreOptionsModal