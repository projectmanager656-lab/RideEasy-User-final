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

/**
 * Last minute of an hour. The quick-select grid only goes up to 55, so this is
 * not derivable from it — it is needed to decide whether a whole hour or
 * half-day has already passed now that any minute 00–59 can be chosen.
 */
const LAST_MINUTE_OF_HOUR = '59'

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
 * Earliest instant the backend will still keep `scheduled`, dispatch lead
 * included, rounded UP to the next whole minute so the value shown is always
 * submittable. Feeds the validation message only — the picker never moves the
 * user's own selection.
 */
function earliestValidInstant(leadMinutes, fromMs = Date.now()) {
    const earliest = fromMs + leadMinutes * 60 * 1000
    return new Date(Math.ceil(earliest / 60_000) * 60_000)
}

/** Defaults represent NOW: today at the device's actual current minute. */
function defaultDateParts() {
    return datePartsFrom(new Date())
}

function defaultTimeParts() {
    return timePartsFrom(new Date())
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
    /**
     * In-progress typed minute, or null when the field should simply show the
     * committed value. Held apart from `parts.minute` so the second digit can be
     * typed without the first one being rewritten underneath the passenger
     * ("3" must not snap to "03" while they are still typing "7").
     */
    const [minuteDraft, setMinuteDraft] = useState(null)
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

    /** Years selectable in the grid — the picker is locked to the current year. */
    const years = useMemo(() => [ today.year ], [today.year])

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
        /**
         * Re-read the clock so reopening never shows a stale day/time. The sheet
         * opens on the device's ACTUAL current minute — it is never rounded to a
         * slot or pushed forward by the dispatch lead.
         */
        const n = new Date()
        setToday({ year: n.getFullYear(), month: n.getMonth(), date: n.getDate() })
        setDateParts(datePartsFrom(n))
        setParts(timePartsFrom(n))
        setMinuteDraft(null)
        setError('')
        setOpenPicker(null)
        /**
         * Only the submit-time check needs the lead, so it settles in the
         * background without touching what the passenger already sees.
         */
        let cancelled = false
        void loadDispatchLeadMinutes().then((lead) => {
            if (!cancelled) setLeadMinutes(lead)
        })
        return () => { cancelled = true }
    }, [open])

    /**
     * Escape closes the open selector first, then the whole modal. A minute being
     * typed is committed before the panel goes away, so leaving the selector never
     * loses a valid value.
     */
    const openPickerRef = useRef(null)
    openPickerRef.current = openPicker
    const commitMinuteRef = useRef(() => false)
    useEffect(() => {
        if (!open) return
        const onKey = (e) => {
            if (e.key !== 'Escape') return
            if (openPickerRef.current) {
                if (openPickerRef.current === 'minute') commitMinuteRef.current()
                setOpenPicker(null)
            } else onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    /**
     * A grid option is unavailable once its own instant is no longer in the
     * future — the same "must be in the future" rule the backend enforces.
     * Whether a future time is ALSO far enough ahead to stay `scheduled` (the
     * dispatch lead) is checked when the passenger submits, so every minute
     * 00–59 stays selectable and the 5-minute cards stay mere shortcuts.
     */
    const slotPassed = (hour, minute, period) =>
        composeLocal(dateParts, { hour, minute, period }).getTime() <= Date.now()

    /** Apply a date/time edit exactly as chosen — the selection is never retimed. */
    const applySelection = (nextDateParts, nextParts) => {
        setDateParts(nextDateParts)
        setParts(nextParts)
        setError('')
        return nextDateParts
    }

    /** Digits only, never longer than two — the range check happens on commit. */
    const onChangeMinute = (raw) =>
        setMinuteDraft(String(raw ?? '').replace(/\D+/g, '').slice(0, 2))

    const minuteDraftRef = useRef(null)
    minuteDraftRef.current = minuteDraft

    /**
     * Commit a typed minute, but only when it really is a minute (00–59).
     * Anything else — empty, "60", "75", stray characters — is discarded and the
     * last valid value stands. Safe to call repeatedly: blur, Enter and Escape all
     * flush the same draft. Returns the committed selection, or null when there was
     * nothing to commit (or the draft was not a minute), so the caller can act on
     * the value without waiting for a re-render.
     */
    const commitMinute = (nextDateParts = dateParts, nextParts = parts) => {
        const draft = minuteDraftRef.current
        if (draft == null) return null
        setMinuteDraft(null)
        const n = Number(draft)
        if (draft === '' || !Number.isInteger(n) || n < 0 || n > 59) return null
        const committed = { ...nextParts, minute: pad2(n) }
        applySelection(nextDateParts, committed)
        return { dateParts: nextDateParts, parts: committed }
    }
    commitMinuteRef.current = commitMinute

    /** The chevron still opens/closes the quick grid; typing commits on the way out. */
    const toggleMinutePicker = () => {
        if (openPicker === 'minute') {
            commitMinute()
            setOpenPicker(null)
            return
        }
        setOpenPicker('minute')
    }

    const handleContinue = () => {
        /** A minute still being typed counts as chosen — commit it before validating. */
        const committed = commitMinute()
        const selection = committed?.parts ?? parts
        const selectionDate = committed?.dateParts ?? dateParts
        const { day, month, year } = selectionDate
        /**
         * Backend is authoritative. Mirrored here only as a gate: a time inside
         * the dispatch lead would be turned into an instant search, so the
         * passenger is asked to pick a later one instead — the selection is left
         * untouched and nothing is converted to Book Now behind their back.
         */
        if (!keepsScheduled(composeLocal(selectionDate, selection).getTime(), leadMinutes)) {
            const { hour, minute, period } = timePartsFrom(earliestValidInstant(leadMinutes))
            setError(t('schedule_too_soon', { time: `${hour}:${minute} ${period}` }))
            return
        }
        setError('')
        onContinue(toIsoLocal(day, month, year, selection.hour, selection.minute, selection.period))
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
                {/**
                 * `minmax(0, 1fr)` on the three field tracks: a bare `1fr` keeps its
                 * `auto` minimum, so the minute input's intrinsic width would stretch
                 * its track and squeeze the hour/AM-PM fields. All three stay equal.
                 */}
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1">
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
                    {/**
                     * Minute field: the value itself is typeable (any 00–59) while the
                     * chevron keeps the original quick-select grid — two ways in, one
                     * value out. The draft is held apart from the committed minute so
                     * typing "3" on the way to "37" is never rewritten underneath.
                     */}
                    <div
                        className={[
                            'flex h-10 min-w-0 items-center rounded-xl border bg-theme-card pl-3 pr-2 text-sm font-semibold text-theme-primary transition',
                            openPicker === 'minute' ? 'border-brand-yellow' : 'border-theme',
                        ].join(' ')}
                    >
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={2}
                            autoComplete="off"
                            aria-label={t('minute')}
                            value={minuteDraft ?? parts.minute}
                            onFocus={(e) => {
                                e.target.select()
                                setOpenPicker('minute')
                            }}
                            onChange={(e) => onChangeMinute(e.target.value)}
                            onBlur={() => commitMinute()}
                            onKeyDown={(e) => {
                                if (e.key !== 'Enter') return
                                e.preventDefault()
                                commitMinute()
                                setOpenPicker(null)
                            }}
                            className="min-w-0 flex-1 bg-transparent text-sm font-semibold tabular-nums text-theme-primary outline-none"
                        />
                        <button
                            type="button"
                            aria-label={t('minute')}
                            aria-expanded={openPicker === 'minute'}
                            onClick={toggleMinutePicker}
                            className="flex h-8 w-5 shrink-0 items-center justify-center active:scale-95"
                        >
                            <i className="ri-arrow-down-s-line text-xs text-brand-yellow" aria-hidden />
                        </button>
                    </div>
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
                                /** A whole hour is unavailable once even its last minute has passed. */
                                disabled={(h) => slotPassed(h, LAST_MINUTE_OF_HOUR, parts.period)}
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
                                disabled={(m) => slotPassed(parts.hour, m, parts.period)}
                                onSelect={(m) => {
                                    setMinuteDraft(null)
                                    applySelection(dateParts, { ...parts, minute: m })
                                    setOpenPicker(null)
                                }}
                            />
                        )}
                        {openPicker === 'period' && (
                            <div className="flex gap-2 p-1">
                                {['AM', 'PM'].map((p) => {
                                    const disabled = slotPassed(parts.hour, LAST_MINUTE_OF_HOUR, p)
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
