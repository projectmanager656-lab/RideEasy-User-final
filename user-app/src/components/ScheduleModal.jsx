import React, { useMemo, useState } from 'react'

function defaultTimeParts() {
    const d = new Date()
    d.setMinutes(d.getMinutes() + 60)
    const h24 = d.getHours()
    const period = h24 >= 12 ? 'PM' : 'AM'
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12
    return { hour: String(h12), minute: '00', period }
}

/** Convert 12-hour (hour 1-12 + AM/PM) to 24-hour "HH:mm". */
function to24HourTime(hour, minute, period) {
    let h24 = Number(hour) % 12
    if (period === 'PM') h24 += 12
    return `${String(h24).padStart(2, '0')}:${minute}`
}

function hourValue(hour, dir) {
    return String((Number(hour) + dir + 11) % 12 + 1)
}

function minuteValue(m, dir) {
    return String((Number(m) + dir * 5 + 60) % 60).padStart(2, '0')
}

function periodValue(period) {
    return period === 'AM' ? 'PM' : 'AM'
}

function setHour(dir, setParts) {
    setParts(p => ({ ...p, hour: hourValue(p.hour, dir) }))
}

function setMinute(dir, setParts) {
    setParts(p => ({ ...p, minute: minuteValue(p.minute, dir) }))
}

function setPeriod(setParts) {
    setParts(p => ({ ...p, period: periodValue(p.period) }))
}

const TimeColumn = ({ label, value, onStep }) => {
    return (
        <div className="flex flex-col items-center gap-1.5">
            <button
                type="button"
                aria-label={`Increase ${label}`}
                onClick={() => onStep(1)}
                className="flex h-9 w-14 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-yellow-400 transition active:scale-95"
            >
                <i className="ri-arrow-up-s-line text-xs" />
            </button>
            <div className="flex h-12 w-14 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-lg font-bold text-yellow-400">
                {value}
            </div>
            <button
                type="button"
                aria-label={`Decrease ${label}`}
                onClick={() => onStep(-1)}
                className="flex h-9 w-14 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-yellow-400 transition active:scale-95"
            >
                <i className="ri-arrow-down-s-line text-xs" />
            </button>
        </div>
    )
}

const ScheduleModal = ({ open, onClose, onContinue, findingTrip }) => {
    const [date, setDate] = useState('')
    const [parts, setParts] = useState(defaultTimeParts)
    const [error, setError] = useState('')

    const minDate = useMemo(() => {
        const d = new Date()
        d.setDate(d.getDate() + 1)
        return d.toISOString().slice(0, 10)
    }, [])

    const handleContinue = () => {
        if (!date) {
            setError('Please pick a date.')
            return
        }
        const time24 = to24HourTime(parts.hour, parts.minute, parts.period)
        const scheduled = new Date(`${date}T${time24}`)
        if (Number.isNaN(scheduled.getTime()) || scheduled.getTime() <= Date.now()) {
            setError('Please choose a future date and time.')
            return
        }
        setError('')
        onContinue(scheduled.toISOString())
    }

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
                    <h2 className="text-base font-bold text-white">Schedule a ride</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full border border-brand-border bg-brand-card px-2.5 py-1 text-xs text-zinc-400 active:scale-95"
                    >
                        Close
                    </button>
                </div>

                <label className="mb-1.5 block text-xs font-medium text-zinc-400">Pickup date</label>
                <input
                    type="date"
                    min={minDate}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border border-brand-border bg-brand-card px-3 py-2.5 text-sm text-white outline-none [color-scheme:dark] focus:border-brand-yellow"
                />

                <label className="mb-2 mt-4 block text-xs font-medium text-zinc-400">Pickup time</label>
                <div className="flex items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-900 p-3">
                    <TimeColumn label="Hour" value={parts.hour} onStep={dir => setHour(dir, setParts)} />
                    <span className="text-xl font-bold text-white" aria-hidden>:</span>
                    <TimeColumn label="Minute" value={parts.minute} onStep={dir => setMinute(dir, setParts)} />
                    <TimeColumn label="AM/PM" value={parts.period} onStep={() => setPeriod(setParts)} />
                </div>

                <p className="mt-2 text-center text-sm font-semibold text-white">
                    {String(parts.hour).padStart(2, '0')} : {parts.minute} {parts.period}
                </p>

                {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

                <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                    Your ride will be booked at the chosen time through the existing booking flow.
                </p>

                <button
                    type="button"
                    disabled={findingTrip}
                    onClick={handleContinue}
                    className="mt-4 w-full rounded-xl border border-brand-yellow bg-brand-yellow py-3 text-sm font-bold text-black transition active:scale-[0.98] disabled:opacity-50"
                >
                    {findingTrip ? 'Booking your ride...' : 'Continue to Booking'}
                </button>
            </div>
        </div>
    )
}

export default ScheduleModal