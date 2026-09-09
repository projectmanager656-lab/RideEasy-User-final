import React from 'react'

const STATUSES = [ 'searching', 'accepted', 'arrived', 'started', 'completed' ]

function labelFor(status) {
    switch (status) {
        case 'searching': return 'Searching'
        case 'accepted': return 'Accepted'
        case 'arrived': return 'Arrived'
        case 'started': return 'Started'
        case 'completed': return 'Completed'
        default: return status || '—'
    }
}

const RideStatusStepper = ({ status }) => {
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
                                        'h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold',
                                        done ? 'bg-emerald-600 text-white' : '',
                                        active ? 'bg-slate-900 text-white' : '',
                                        !done && !active ? 'bg-slate-200 text-slate-700' : '',
                                    ].join(' ')}
                                >
                                    {idx + 1}
                                </div>
                                <div className="text-xs font-medium text-slate-700 truncate">{labelFor(s)}</div>
                            </div>
                            {idx < STATUSES.length - 1 && (
                                <div className="mt-2 h-1 rounded-full bg-slate-200 overflow-hidden">
                                    <div className={`h-full ${done ? 'bg-emerald-600 w-full' : active ? 'bg-slate-900 w-1/2' : 'bg-slate-200 w-0'}`} />
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

