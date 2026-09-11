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
            <div className="flex items-center justify-between gap-2">
                {STATUSES.map((s, idx) => {
                    const done = idx < currentIdx
                    const active = idx === currentIdx
                    return (
                        <div key={s} className="flex-1">
                            <div className="flex items-center gap-2">
                                <div
                                    className={[
                                        'h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold',
                                        done ? 'bg-emerald-600 text-white' : '',
                                        active ? 'bg-sky-600 text-white' : '',
                                        !done && !active ? 'bg-theme-card-muted text-theme-muted' : '',
                                    ].join(' ')}
                                >
                                    {idx + 1}
                                </div>
                                <div className="text-xs font-medium text-theme-primary truncate">{labelFor(s, t)}</div>
                            </div>
                            {idx < STATUSES.length - 1 && (
                                <div className="mt-2 h-1 rounded-full bg-theme-card-muted overflow-hidden">
                                    <div className={`h-full ${done ? 'bg-emerald-600 w-full' : active ? 'bg-sky-600 w-1/2' : 'bg-theme-card-muted w-0'}`} />
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

