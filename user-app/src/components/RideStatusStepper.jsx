import React from 'react'
import { useLanguage } from '../i18n'

const STATUSES = [ 'searching', 'accepted', 'arrived', 'started', 'completed' ]

const STATUS_KEYS = {
    searching: 'stepper_finding_driver',
    accepted: 'stepper_assigned',
    arrived: 'stepper_arrived',
    started: 'stepper_live_ride',
    completed: 'done',
}

function labelFor(status, t) {
    const key = STATUS_KEYS[status]
    return key ? t(key) : status || '—'
}

const RideStatusStepper = ({ status }) => {
    const { t } = useLanguage()
    const currentIdx = Math.max(0, STATUSES.indexOf(status || 'searching'))
    return (
        <div className="w-full">
            <div className="flex items-start justify-between">
                {STATUSES.map((s, idx) => {
                    const done = idx < currentIdx
                    const active = idx === currentIdx
                    return (
                        <div key={s} className="relative min-w-0 flex-1">
                            <div className="relative z-10 flex flex-col items-center gap-1 text-center">
                                <div
                                    className={[
                                        'h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold',
                                        done ? 'bg-brand-yellow text-brand-dark' : '',
                                        active ? 'bg-brand-yellow text-brand-dark ring-2 ring-brand-yellow/30' : '',
                                        !done && !active ? 'bg-theme-card-muted text-theme-muted' : '',
                                    ].join(' ')}
                                >
                                    {idx + 1}
                                </div>
                                <div className="max-w-full px-0.5 text-[10px] font-medium leading-tight text-theme-primary sm:text-xs">{labelFor(s, t)}</div>
                            </div>
                            {idx < STATUSES.length - 1 && (
                                <div className="absolute left-1/2 right-0 top-3.5 h-1 rounded-full bg-theme-card-muted">
                                    <div className={`h-full ${done ? 'w-full bg-brand-yellow' : active ? 'w-1/2 bg-brand-yellow' : 'w-0'}`} />
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export default RideStatusStepper

