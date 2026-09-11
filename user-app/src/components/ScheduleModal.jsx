import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../i18n'

const HOURS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

/** Localized month names (index 0 = January) built from i18n keys. */
function localizedMonths(t) {
    return Array.from({ length: 12 }, (_, i) => t(`month_${i}`))
}

function pad2(n) {
    return String(n).padStart(2, '0')
}

function defaultDateParts() {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return { day: d.getDate(), month: d.getMonth(), year: d.getFullYear() }
}

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

/** Compose local (no-UTC-shift) date + time into an ISO string for the booking flow. */
function toIsoLocal(day, month, year, hour, minute, period) {
    const hh = to24HourTime(hour, minute, period)
    const iso = `${year}-${pad2(month + 1)}-${pad2(day)}T${hh}:00`
    return iso
}

function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate()
}

function dayDisabled(day, month, year, today) {
    const future = year > today.year
        || (year === today.year && month > today.month)
    if (future) return false
    return !(year === today.year && month == today.month && day > today.date)
}

function gridCellClass(selected, disabled) {
    return [
        'flex h-9 items-center justify-center rounded-lg border text-sm font-semibold transition active:scale-95',
        selected
            ? 'border-brand-yellow bg-brand-yellow text-black'
            : disabled
                ? 'cursor-not-allowed border-transparent bg-transparent text-theme-muted'
                : 'border-theme bg-theme-card text-theme-primary hover:border-theme-strong',
    ].join(' ')
}

/**
 * Compact RideEasy-styled option grid — used for days, months, years,
 * hours and minutes. No scrolling, one tap to pick.
 */
const OptionGrid = ({ options, selected, disabled = () => false, onSelect, label = (v) => v, columns = 4 }) => (
    <div className={`grid gap-1 p-0.5 ${columns === 7 ? 'grid-cols-7' : columns === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
        {options.map((opt, idx) => (
            <button
                key={idx}
                type="button"
                disabled={disabled(opt)}
                onClick={() => onSelect(opt)}
                className={[
                    gridCellClass(selected(opt), disabled(opt)),
                    columns === 7 ? 'h-9 px-0 text-[13px]' : 'h-9',
                ].join(' ')}
            >
                {label(opt)}
            </button>
        ))}
    </div>
)

const ScheduleModal = ({ open, onClose, onContinue, findingTrip }) => {
    const { t } = useLanguage()
    const months = localizedMonths(t)
    const [dateParts, setDateParts] = useState(defaultDateParts)
    const [parts, setParts] = useState(defaultTimeParts)
    const [error, setError] = useState('')
    const [openPicker, setOpenPicker] = useState(null) // 'day' | 'month' | 'year' | 'hour' | 'minute' | 'period'
    const sheetRef = useRef(null)

    const today = useMemo(() => {
        const n = new Date()
        return { year: n.getFullYear(), month: n.getMonth(), date: n.getDate() }
    }, [])

    const years = useMemo(() => [today.year], [today.year])

    const dayCount = daysInMonth(dateParts.year, dateParts.month)

    /** Sync the last-opened selector into view when it opens. */
    useEffect(() => {
        if (!openPicker || !sheetRef.current) return
        const t = setTimeout(() => {
            const el = sheetRef.current?.querySelector('[data-picker-panel]')
            if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }, 60)
        return () => clearTimeout(t)
    }, [openPicker])

    /** Reset state only when the modal transitions closed → open. */
    const wasOpenRef = useRef(false)
    useEffect(() => {
        if (open && !wasOpenRef.current) {
            setDateParts(defaultDateParts)
            setParts(defaultTimeParts)
            setError('')
            setOpenPicker(null)
        }
        wasOpenRef.current = open
    }, [open])

    /** Escape closes the open selector first, then the whole modal. */
    const openPickerRef = useRef(null)
    openPickerRef.current = openPicker
    useEffect(() => {
        if (!open) return
        const onKey = (e) => {
            if (e.key !== 'Escape') return
            if (openPickerRef.current) setOpenPicker(null)
            else onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    const handleContinue = () => {
        const { day, month, year } = dateParts
        const time24 = to24HourTime(parts.hour, parts.minute, parts.period)
        const scheduled = new Date(`${year}-${pad2(month + 1)}-${pad2(day)}T${time24}`)
        if (Number.isNaN(scheduled.getTime()) || scheduled.getTime() <= Date.now()) {
            setError(t('choose_future_date_time'))
            return
        }
        setError('')
        onContinue(toIsoLocal(day, month, year, parts.hour, parts.minute, parts.period))
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
                onClick={onClose}
                aria-hidden
            />
            <div
                ref={sheetRef}
                className="relative flex max-h-[88dvh] w-full max-w-[340px] flex-col overflow-y-auto rounded-t-2xl border-t border-theme bg-theme-card p-2.5 pb-4 sm:rounded-2xl sm:border"
            >
                <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-theme-card-muted sm:hidden" />
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-base font-bold text-theme-primary">{t('schedule_a_ride')}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full border border-theme bg-theme-card-muted px-2.5 py-1 text-xs text-theme-secondary active:scale-95"
                    >
                        {t('close')}
                    </button>
                </div>

                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-theme-secondary">
                    {t('pickup_date')}
                </label>
                <div className="grid grid-cols-[1fr_1.2fr_1fr] gap-1">
                    <button
                        type="button"
                        aria-label={t('day')}
                        onClick={() => setOpenPicker('day')}
                        className={[
                            'flex h-10 items-center justify-between rounded-xl border bg-theme-card px-3 text-sm font-semibold text-theme-primary transition active:scale-[0.98]',
                            openPicker === 'day' ? 'border-brand-yellow' : 'border-theme',
                        ].join(' ')}
                    >
                        {pad2(dateParts.day)}
                        <i className="ri-arrow-down-s-line text-xs text-brand-yellow" />
                    </button>
                    <button
                        type="button"
                        aria-label={t('month')}
                        onClick={() => setOpenPicker('month')}
                        className={[
                            'flex h-10 items-center justify-between rounded-xl border bg-theme-card px-3 text-sm font-semibold text-theme-primary transition active:scale-[0.98]',
                            openPicker === 'month' ? 'border-brand-yellow' : 'border-theme',
                        ].join(' ')}
                    >
                        <span className="truncate">{months[dateParts.month]}</span>
                        <i className="ri-arrow-down-s-line text-xs text-brand-yellow" />
                    </button>
                    <div
                        aria-label={t('year')}
                        className="flex h-10 items-center justify-between rounded-xl border border-theme bg-theme-card px-3 text-sm font-semibold text-theme-primary"
                    >
                        {dateParts.year}
                        <i className="ri-lock-line text-xs text-theme-muted" aria-hidden />
                    </div>
                </div>

                <label className="mb-2 mt-4 block text-xs font-medium uppercase tracking-wide text-theme-secondary">
                    {t('pickup_time')}
                </label>
                <div className="grid grid-cols-[1fr_auto_1fr_1fr] items-center gap-1">
                    <button
                        type="button"
                        aria-label={t('hour')}
                        onClick={() => setOpenPicker('hour')}
                        className={[
                            'flex h-10 items-center justify-between rounded-xl border bg-theme-card px-3 text-sm font-semibold text-theme-primary transition active:scale-[0.98]',
                            openPicker === 'hour' ? 'border-brand-yellow' : 'border-theme',
                        ].join(' ')}
                    >
                        {parts.hour}
                        <i className="ri-arrow-down-s-line text-xs text-brand-yellow" />
                    </button>
                    <span className="text-base font-bold text-theme-primary" aria-hidden>:</span>
                    <button
                        type="button"
                        aria-label={t('minute')}
                        onClick={() => setOpenPicker('minute')}
                        className={[
                            'flex h-10 items-center justify-between rounded-xl border bg-theme-card px-3 text-sm font-semibold text-theme-primary transition active:scale-[0.98]',
                            openPicker === 'minute' ? 'border-brand-yellow' : 'border-theme',
                        ].join(' ')}
                    >
                        {parts.minute}
                        <i className="ri-arrow-down-s-line text-xs text-brand-yellow" />
                    </button>
                    <button
                        type="button"
                        aria-label={t('am_pm')}
                        onClick={() => setOpenPicker('period')}
                        className={[
                            'flex h-10 items-center justify-between rounded-xl border bg-theme-card px-3 text-sm font-semibold text-theme-primary transition active:scale-[0.98]',
                            openPicker === 'period' ? 'border-brand-yellow' : 'border-theme',
                        ].join(' ')}
                    >
                        {parts.period}
                        <i className="ri-arrow-down-s-line text-xs text-brand-yellow" />
                    </button>
                </div>

                <p className="mt-2.5 text-center text-sm font-bold text-brand-yellow">
                    {pad2(Number(parts.hour))} : {parts.minute} {parts.period}
                </p>

                {error && <p className="mt-2 text-center text-xs text-red-400">{error}</p>}

                <p className="mt-2 text-center text-[11px] leading-relaxed text-theme-muted">
                    {t('schedule_info_line')}
                </p>

                <button
                    type="button"
                    disabled={findingTrip}
                    onClick={handleContinue}
                    className="mt-3 w-full rounded-xl border border-brand-yellow bg-brand-yellow py-2 text-sm font-bold text-black transition active:scale-[0.98] disabled:opacity-50"
                >
                    {findingTrip ? t('booking_your_ride') : t('continue_to_booking')}
                </button>

                {openPicker && (
                    <div data-picker-panel className="relative mt-2.5 rounded-xl border border-theme bg-theme-card-muted p-1.5">
                        {openPicker === 'day' && (
                            <OptionGrid
                                options={Array.from({ length: dayCount }, (_, i) => i + 1)}
                                selected={(d) => d === dateParts.day}
                                disabled={(d) => dayDisabled(d, dateParts.month, dateParts.year, today)}
                                onSelect={(d) => {
                                    setDateParts((p) => ({ ...p, day: d }))
                                    setOpenPicker(null)
                                }}
                                columns={7}
                            />
                        )}
                        {openPicker === 'month' && (
                            <OptionGrid
                                options={Array.from({ length: 12 }, (_, i) => i)}
                                selected={(m) => m === dateParts.month}
                                disabled={() => false}
                                onSelect={(m) => {
                                    setDateParts((p) => {
                                        const maxDay = daysInMonth(p.year, m)
                                        const day = Math.min(p.day, maxDay)
                                        return { ...p, month: m, day }
                                    })
                                    setOpenPicker(null)
                                }}
                                label={(m) => months[m].slice(0, 3)}
                            />
                        )}
                        {openPicker === 'year' && (
                            <OptionGrid
                                options={years}
                                selected={(y) => y === dateParts.year}
                                disabled={() => false}
                                onSelect={(y) => {
                                    setDateParts((p) => {
                                        const maxDay = daysInMonth(y, p.month)
                                        const day = Math.min(p.day, maxDay)
                                        return { ...p, year: y, day }
                                    })
                                    setOpenPicker(null)
                                }}
                                columns={3}
                            />
                        )}
                        {openPicker === 'hour' && (
                            <OptionGrid
                                options={HOURS}
                                selected={(h) => h === parts.hour}
                                disabled={() => false}
                                onSelect={(h) => {
                                    setParts((p) => ({ ...p, hour: h }))
                                    setOpenPicker(null)
                                }}
                            />
                        )}
                        {openPicker === 'minute' && (
                            <OptionGrid
                                options={MINUTES}
                                selected={(m) => m === parts.minute}
                                disabled={() => false}
                                onSelect={(m) => {
                                    setParts((p) => ({ ...p, minute: m }))
                                    setOpenPicker(null)
                                }}
                            />
                        )}
                        {openPicker === 'period' && (
                            <div className="flex gap-2 p-1">
                                {['AM', 'PM'].map((p) => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => {
                                            setParts((prev) => ({ ...prev, period: p }))
                                            setOpenPicker(null)
                                        }}
                                        className={[
                                            'h-10 flex-1 rounded-lg border text-sm font-bold transition active:scale-95',
                                            parts.period === p
                                                ? 'border-brand-yellow bg-brand-yellow text-black'
                                                : 'border-theme bg-theme-card text-theme-primary hover:border-theme-strong',
                                        ].join(' ')}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export default ScheduleModal
