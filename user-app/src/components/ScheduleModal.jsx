import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../i18n'
import { API_BASE_URL } from '../config/apiBaseUrl'

const HOURS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

/** Localized month names (index 0 = January) built from i18n keys. */
function localizedMonths(t) {
    return Array.from({ length: 12 }, (_, i) => t(`month_${i}`))
}

function pad2(n) {
    return String(n).padStart(2, '0')
}

/** Minute grid step, derived from the grid itself so there is ONE source of truth. */
const SLOT_MINUTES = Number(MINUTES[1]) - Number(MINUTES[0])

/**
 * Conservative fallback for the dispatch lead, used only until (or if) the backend
 * rule cannot be read. Deliberately LARGER than any expected lead so the picker
 * stays stricter, never looser — it can never offer a time the backend would
 * immediately turn into an instant search.
 */
const FALLBACK_LEAD_MINUTES = 15

let dispatchLeadCache = null
let dispatchLeadPromise = null

/**
 * Read the dispatch lead the backend publishes at GET /config/scheduling.
 * That endpoint is the ONE canonical source of the rule; the picker mirrors it so
 * the frontend can never offer a pickup time the backend would dispatch instantly.
 * Plain `fetch` (no auth) because `/config/*` is intentionally outside the
 * passenger apiClient allow-list.
 */
function loadDispatchLeadMinutes() {
    if (dispatchLeadCache != null) return Promise.resolve(dispatchLeadCache)
    if (!dispatchLeadPromise) {
        dispatchLeadPromise = fetch(`${API_BASE_URL}/config/scheduling`)
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`config ${res.status}`))))
            .then((body) => {
                const lead = Number(body?.scheduledDispatchLeadMinutes)
                if (!Number.isFinite(lead) || lead < 0) throw new Error('invalid scheduling lead')
                dispatchLeadCache = lead
                return lead
            })
            .catch(() => {
                dispatchLeadCache = FALLBACK_LEAD_MINUTES
                return dispatchLeadCache
            })
    }
    return dispatchLeadPromise
}

/**
 * Earliest instant the backend will accept: `now` rounded UP to the next slot on
 * the picker's own minute grid. It never rounds down into the past, and
 * `Date` normalisation handles hour / day / month / year rollover for free.
 */
function nextValidSlot(from = new Date()) {
    const d = new Date(from)
    d.setSeconds(0, 0)
    const remainder = d.getMinutes() % SLOT_MINUTES
    d.setMinutes(d.getMinutes() + (SLOT_MINUTES - remainder))
    return d
}

function datePartsFrom(d) {
    return { day: d.getDate(), month: d.getMonth(), year: d.getFullYear() }
}

function timePartsFrom(d) {
    const h24 = d.getHours()
    return {
        hour: String(h24 % 12 === 0 ? 12 : h24 % 12),
        minute: pad2(d.getMinutes()),
        period: h24 >= 12 ? 'PM' : 'AM',
    }
}

/**
 * The dispatch instant the backend derives for a pickup, i.e. the moment it would
 * start searching. Mirrors `resolveScheduleWindow()` exactly.
 */
function dispatchInstantFor(pickupMs, leadMinutes) {
    return pickupMs - leadMinutes * 60 * 1000
}

/** True when the backend would keep this pickup as a genuine scheduled ride. */
function keepsScheduled(pickupMs, leadMinutes, nowMs = Date.now()) {
    return dispatchInstantFor(pickupMs, leadMinutes) > nowMs
}

/**
 * Earliest grid slot the backend will still keep `scheduled` — the first slot whose
 * dispatch instant is strictly in the future. Never rounds down into the past.
 */
function earliestSchedulableSlot(leadMinutes, from = new Date()) {
    const d = nextValidSlot(from)
    const maxSteps = Math.ceil((leadMinutes + 60) / SLOT_MINUTES) + 1
    for (let i = 0; i < maxSteps; i += 1) {
        if (keepsScheduled(d.getTime(), leadMinutes, from.getTime())) return d
        d.setMinutes(d.getMinutes() + SLOT_MINUTES)
    }
    return d
}

/** Defaults represent NOW (today at the earliest slot the backend will keep). */
function defaultDateParts(leadMinutes = FALLBACK_LEAD_MINUTES) {
    return datePartsFrom(earliestSchedulableSlot(leadMinutes))
}

function defaultTimeParts(leadMinutes = FALLBACK_LEAD_MINUTES) {
    return timePartsFrom(earliestSchedulableSlot(leadMinutes))
}

/** Convert 12-hour (hour 1-12 + AM/PM) to a 24-hour number. Handles 12 AM → 0, 12 PM → 12. */
function to24Hour(hour, period) {
    const h12 = Number(hour) % 12
    return period === 'PM' ? h12 + 12 : h12
}

/** Convert 12-hour (hour 1-12 + AM/PM) to 24-hour "HH:mm". */
function to24HourTime(hour, minute, period) {
    return `${pad2(to24Hour(hour, period))}:${minute}`
}

/**
 * Compose the selected calendar date + 12-hour time into a LOCAL Date.
 * The numeric constructor is used deliberately: it is unambiguous local time,
 * unlike parsing formatted strings.
 */
function composeLocal(dateParts, { hour, minute, period }) {
    return new Date(
        dateParts.year,
        dateParts.month,
        dateParts.day,
        to24Hour(hour, period),
        Number(minute),
        0,
        0,
    )
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

/** Past dates are unavailable; TODAY stays selectable (its past times are handled separately). */
function dayDisabled(day, month, year, today) {
    if (year !== today.year) return year < today.year
    if (month !== today.month) return month < today.month
    return day < today.date
}

/**
 * Snap a selection back to the earliest schedulable slot whenever the backend would
 * NOT keep it as a scheduled ride — used after every date/time edit, so the picker
 * can never submit a time that would silently become an instant search.
 */
function ensureValidSelection(dateParts, parts, leadMinutes) {
    if (keepsScheduled(composeLocal(dateParts, parts).getTime(), leadMinutes)) {
        return { dateParts, parts }
    }
    const slot = earliestSchedulableSlot(leadMinutes)
    return { dateParts: datePartsFrom(slot), parts: timePartsFrom(slot) }
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

    /**
     * Today is STATE, not a one-off memo: the modal stays mounted for the whole
     * session, so it is refreshed every time the sheet opens. Otherwise a session
     * left open past midnight would keep treating yesterday as "today".
     */
    const [today, setToday] = useState(() => {
        const n = new Date()
        return { year: n.getFullYear(), month: n.getMonth(), date: n.getDate() }
    })

    /**
     * Backend dispatch lead. Seeded conservatively, then replaced by the value the
     * backend publishes (GET /config/scheduling) so the picker mirrors the real rule.
     */
    const [leadMinutes, setLeadMinutes] = useState(FALLBACK_LEAD_MINUTES)

    /** Fetch the rule as soon as the app mounts, so it is ready before the first open. */
    useEffect(() => {
        let cancelled = false
        void loadDispatchLeadMinutes().then((lead) => {
            if (!cancelled) setLeadMinutes(lead)
        })
        return () => { cancelled = true }
    }, [])

    /** Years selectable in the grid — current year, plus next year when a slot rolls over. */
    const years = useMemo(
        () => Array.from(new Set([ today.year, nextValidSlot().getFullYear() ])).sort(),
        [today.year],
    )

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
        if (!open || wasOpenRef.current) {
            wasOpenRef.current = open
            return undefined
        }
        wasOpenRef.current = open
        /** Re-read the clock so reopening never shows a stale day/time. */
        const n = new Date()
        setToday({ year: n.getFullYear(), month: n.getMonth(), date: n.getDate() })
        setError('')
        setOpenPicker(null)
        /**
         * Seed from the backend's current rule. The lead is cached after the first
         * fetch, so this settles within a microtask and the seed is exact.
         */
        let cancelled = false
        void loadDispatchLeadMinutes().then((lead) => {
            if (cancelled) return
            setLeadMinutes(lead)
            setDateParts(defaultDateParts(lead))
            setParts(defaultTimeParts(lead))
        })
        return () => { cancelled = true }
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

    /**
     * Unavailable when the backend would NOT keep this slot as a scheduled ride —
     * i.e. the whole dispatch lead must still be in the future. One rule, mirrored
     * from the server, so the picker and the backend always agree.
     */
    const slotUnavailable = (hour, minute, period) =>
        !keepsScheduled(composeLocal(dateParts, { hour, minute, period }).getTime(), leadMinutes)
    const LAST_MINUTE = MINUTES[MINUTES.length - 1]

    /**
     * Apply a date/time edit, then snap the whole selection forward if the backend
     * would no longer keep it scheduled (e.g. switching back to today).
     */
    const applySelection = (nextDateParts, nextParts) => {
        const { dateParts: dp, parts: p } = ensureValidSelection(nextDateParts, nextParts, leadMinutes)
        setDateParts(dp)
        setParts(p)
        setError('')
        return dp
    }

    const handleContinue = () => {
        const { day, month, year } = dateParts
        /** Backend is authoritative; this mirrors its rule before we submit. */
        if (!keepsScheduled(composeLocal(dateParts, parts).getTime(), leadMinutes)) {
            applySelection(dateParts, parts)
            const earliest = earliestSchedulableSlot(leadMinutes)
            setError(t('schedule_too_soon', {
                time: `${pad2(earliest.getHours() % 12 === 0 ? 12 : earliest.getHours() % 12)}:${pad2(earliest.getMinutes())} ${earliest.getHours() >= 12 ? 'PM' : 'AM'}`,
            }))
            return
        }
        setError('')
        onContinue(toIsoLocal(day, month, year, parts.hour, parts.minute, parts.period))
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-[1200] flex items-end justify-center sm:items-center">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
                onClick={onClose}
                aria-hidden
            />
            <div
                ref={sheetRef}
                className="relative z-[1201] flex max-h-[88dvh] w-full max-w-[340px] flex-col overflow-y-auto rounded-t-2xl border-t border-theme bg-theme-card p-2.5 pb-4 sm:rounded-2xl sm:border"
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
                                    applySelection({ ...dateParts, day: d }, parts)
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
                                    const maxDay = daysInMonth(dateParts.year, m)
                                    const day = Math.min(dateParts.day, maxDay)
                                    applySelection({ ...dateParts, month: m, day }, parts)
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
                                    const maxDay = daysInMonth(y, dateParts.month)
                                    const day = Math.min(dateParts.day, maxDay)
                                    applySelection({ ...dateParts, year: y, day }, parts)
                                    setOpenPicker(null)
                                }}
                                columns={3}
                            />
                        )}
                        {openPicker === 'hour' && (
                            <OptionGrid
                                options={HOURS}
                                selected={(h) => h === parts.hour}
                                /** A whole hour is unavailable once even its last slot has passed. */
                                disabled={(h) => slotUnavailable(h, LAST_MINUTE, parts.period)}
                                onSelect={(h) => {
                                    applySelection(dateParts, { ...parts, hour: h })
                                    setOpenPicker(null)
                                }}
                            />
                        )}
                        {openPicker === 'minute' && (
                            <OptionGrid
                                options={MINUTES}
                                selected={(m) => m === parts.minute}
                                disabled={(m) => slotUnavailable(parts.hour, m, parts.period)}
                                onSelect={(m) => {
                                    applySelection(dateParts, { ...parts, minute: m })
                                    setOpenPicker(null)
                                }}
                            />
                        )}
                        {openPicker === 'period' && (
                            <div className="flex gap-2 p-1">
                                {['AM', 'PM'].map((p) => {
                                    const disabled = slotUnavailable(parts.hour, LAST_MINUTE, p)
                                    return (
                                        <button
                                            key={p}
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => {
                                                applySelection(dateParts, { ...parts, period: p })
                                                setOpenPicker(null)
                                            }}
                                            className={[
                                                'h-10 flex-1 rounded-lg border text-sm font-bold transition active:scale-95',
                                                disabled
                                                    ? 'cursor-not-allowed border-transparent bg-transparent text-theme-muted'
                                                    : parts.period === p
                                                        ? 'border-brand-yellow bg-brand-yellow text-black'
                                                        : 'border-theme bg-theme-card text-theme-primary hover:border-theme-strong',
                                            ].join(' ')}
                                        >
                                            {p}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export default ScheduleModal
