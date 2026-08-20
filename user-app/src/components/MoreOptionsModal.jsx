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
        id: 'airport',
        label: 'Airport Ride',
        note: 'Coming soon',
        icon: (
            <Svg>
                <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z" />
            </Svg>
        ),
    },
    {
        id: 'rental',
        label: 'Rental',
        note: 'Coming soon',
        icon: (
            <Svg>
                <rect x="4" y="3" width="16" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
            </Svg>
        ),
    },
    {
        id: 'corporate',
        label: 'Corporate Ride',
        note: 'Coming soon',
        icon: (
            <Svg>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" />
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