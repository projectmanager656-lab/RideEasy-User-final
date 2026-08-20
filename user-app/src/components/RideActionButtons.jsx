import React from 'react'

const Svg = ({ children, className = 'h-5 w-5' }) => (
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

const actionConfig = [
    {
        id: 'rideNow',
        label: 'Ride Now',
        subtitle: 'Book a ride',
        primary: true,
        icon: (
            <Svg>
                <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" />
                <path d="M3 11h18v3a1 1 0 0 1-1 1h-1v4h-2v-4H7v4H5v-4H4a1 1 0 0 1-1-1v-3Z" />
                <circle cx="7.5" cy="15" r="0.5" />
                <circle cx="16.5" cy="15" r="0.5" />
            </Svg>
        ),
    },
    {
        id: 'schedule',
        label: 'Schedule',
        subtitle: 'Book for later',
        primary: false,
        icon: (
            <Svg>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
                <path d="M12 14h.01M16 14h.01M8 14h.01M12 18h.01M16 18h.01M8 18h.01" />
            </Svg>
        ),
    },
    {
        id: 'more',
        label: 'More',
        subtitle: 'Additional services',
        primary: false,
        icon: (
            <Svg>
                <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
            </Svg>
        ),
    },
]

const RideActionButtons = ({
    onRideNow,
    onSchedule,
    onMore,
    findingTrip,
    ready = false,
}) => {
    const handlers = {
        rideNow: onRideNow,
        schedule: onSchedule,
        more: onMore,
    }

    return (
        <div className="mx-4 mb-3 grid shrink-0 grid-cols-3 gap-2">
            {actionConfig.map((a) => {
                const isPrimary = a.primary
                const disabled = (isPrimary && !ready) || findingTrip
                return (
                    <button
                        key={a.id}
                        type="button"
                        disabled={disabled}
                        onClick={handlers[a.id]}
                        className={[
                            'flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 transition active:scale-95',
                            isPrimary
                                ? ready
                                    ? 'border-brand-yellow bg-brand-yellow text-black shadow-lg shadow-brand-yellow/20'
                                    : 'border-brand-border bg-brand-card text-zinc-600'
                                : 'border-brand-border bg-brand-card text-zinc-200',
                            disabled ? 'opacity-70' : '',
                        ].join(' ')}
                    >
                        <span className={isPrimary && ready ? 'text-black' : 'text-brand-yellow'}>
                            {a.icon}
                        </span>
                        <span className="text-[11px] font-bold leading-none">{a.label}</span>
                        <span className="text-[9px] font-medium leading-none text-[#707070]">
                            {a.subtitle}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}

export default RideActionButtons