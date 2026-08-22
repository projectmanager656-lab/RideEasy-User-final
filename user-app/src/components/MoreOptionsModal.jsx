import React from 'react'

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

const MoreOptionsModal = ({ open, onClose }) => {
    if (!open) return null

    return (
        <div className="absolute inset-0 z-40 flex flex-col justify-end">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
                onClick={onClose}
                aria-hidden
            />
            <div className="relative max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-brand-border bg-[#101010] p-4">
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