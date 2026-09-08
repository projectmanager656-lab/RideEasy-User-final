import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient, withAuth } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { stripApiEnvelope } from '../utils/apiBody'
import { useLanguage } from '../i18n'
import vehicleAutoImg from '../assets/logo-auto.png'
import vehicleCarImg from '../assets/logo-car.png'
import vehicleBikeImg from '../assets/logo-bike.png'

// ===========================================================================
//  Demo data — frontend only.
//  Rendered when the backend is unreachable (or returns no rides) so the page
//  always shows a realistic RideEasy ride history. No API/backend change.
// ===========================================================================
const demoRideHistory = [
  {
    id: 'demo-001',
    vehicleType: 'Auto',
    status: 'completed',
    date: '12 Aug 2026',
    time: '10:35 AM',
    pickup: 'Ichalkaranji Bus Stand',
    destination: 'Kabnur',
    fare: 145,
    distance: '4.2 km',
    duration: '12 min',
    paymentMethod: 'Cash',
    passengers: 1,
    captain: { name: 'Ramesh Patil', phone: '+91-9876543210', vehicleType: 'Auto', vehicleNumber: 'MH 12 AB 1234' },
    rating: 4.8,
  },
  {
    id: 'demo-002',
    vehicleType: 'Car',
    status: 'completed',
    date: '10 Aug 2026',
    time: '6:20 PM',
    pickup: 'Kolhapur Road',
    destination: 'Rankala Lake',
    fare: 280,
    distance: '8.5 km',
    duration: '22 min',
    paymentMethod: 'UPI',
    passengers: 1,
    captain: { name: 'Suresh Kumar', phone: '+91-9876543221', vehicleType: 'Car', vehicleNumber: 'MH 12 CD 5678' },
    rating: 4.5,
  },
  {
    id: 'demo-003',
    vehicleType: 'Bike',
    status: 'completed',
    date: '09 Aug 2026',
    time: '11:00 AM',
    pickup: 'Shivaji University',
    destination: 'DYP Colony',
    fare: 98,
    distance: '3.1 km',
    duration: '8 min',
    paymentMethod: 'Online',
    passengers: 1,
    captain: { name: 'Mahesh Rao', phone: '+91-9876543322', vehicleType: 'Bike', vehicleNumber: 'MH 12 EF 9012' },
    rating: 5,
  },
  {
    id: 'demo-004',
    vehicleType: 'Auto',
    status: 'cancelled',
    date: '08 Aug 2026',
    time: '8:15 PM',
    pickup: 'Market Yard',
    destination: 'Panhala Fort',
    fare: 0,
    cancellationFee: 15,
    paymentMethod: 'Pay later',
    passengers: 1,
  },
  {
    id: 'demo-005',
    vehicleType: 'Car',
    status: 'completed',
    date: '07 Aug 2026',
    time: '4:45 PM',
    pickup: 'Kolhapur ST Stand',
    destination: 'Panhala',
    fare: 312,
    distance: '18 km',
    duration: '35 min',
    paymentMethod: 'UPI',
    passengers: 1,
    captain: { name: 'Dinesh Shah', phone: '+91-9876543423', vehicleType: 'Car', vehicleNumber: 'MH 12 GH 3456' },
    rating: 4.2,
  },
  {
    id: 'demo-006',
    vehicleType: 'Bike',
    status: 'accepted',
    date: '21 Aug 2026',
    time: '9:00 AM',
    pickup: 'DYP Colony',
    destination: 'Kolhapur Airport',
    fare: 350,
    distance: '9.4 km',
    duration: '20 min',
    paymentMethod: 'Online',
    passengers: 1,
    captain: { name: 'Nikhil Desai', phone: '+91-9876543524', vehicleType: 'Bike', vehicleNumber: 'MH 12 IJ 7890' },
  },
]

// Backend ride statuses that represent an upcoming / active trip (not yet done).
const ACTIVE_STATUSES = new Set(['searching', 'accepted', 'arrived', 'started'])

// ---------------------------------------------------------------------------
// Helpers — shape both demo rides and live API rides the same way.
// ---------------------------------------------------------------------------
function normalizeRide(r) {
  const status = String(r?.status || '').toLowerCase()
  return {
    id: String(r?._id || r?.id || r?.rideId || ''),
    vehicleType: r?.vehicleType || 'Auto',
    status,
    fare: r?.price ?? r?.fare ?? 0,
    date: r?.date || null,
    time: r?.time || null,
    completedAt: r?.completedAt,
    createdAt: r?.createdAt,
    pickup: r?.pickupLocation || r?.pickup || '—',
    destination: r?.dropLocation || r?.destination || '—',
    distance: r?.distance,
    duration: r?.duration,
    paymentMethod: r?.paymentMethod,
    captain: r?.captain || null,
    rating: r?.rating != null ? Number(r.rating) : null,
    cancellationFee: r?.cancellationFee != null ? Number(r.cancellationFee) : null,
    passengers: r?.passengers ?? r?.passengerCount ?? 1,
  }
}

function rideDate(r) {
  if (r.date && r.time) return `${r.date}, ${r.time}`
  const ts = r.completedAt || r.createdAt
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return ''
  }
}

/** Stable `YYYY-MM-DD` key for a ride (for calendar day matching). */
function rideDateKey(r) {
  if (r.date) {
    const m = String(r.date).match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/)
    if (m) {
      const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }
      const mo = months[m[2]]
      if (mo != null) {
        const d = new Date(Date.UTC(Number(m[3]), mo, Number(m[1])))
        return d.toISOString().slice(0, 10)
      }
    }
  }
  const ts = r.completedAt || r.createdAt
  if (!ts) return ''
  try {
    return new Date(ts).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

function statusBadge(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'completed') return { label: 'Completed', className: 'border border-emerald-500 text-emerald-600 dark:text-emerald-400' }
  if (s === 'cancelled') return { label: 'Cancelled', className: 'bg-red-500 text-white' }
  if (ACTIVE_STATUSES.has(s)) return { label: 'Upcoming', className: 'border border-sky-500 text-sky-600 dark:text-sky-400' }
  return { label: s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : 'Pending', className: 'bg-theme-card-muted text-theme-muted' }
}

const VEHICLE_IMAGE = {
  AUTO: vehicleAutoImg,
  BIKE: vehicleBikeImg,
  CAR: vehicleCarImg,
  MINI: vehicleCarImg,
  SEDAN: vehicleCarImg,
}

function vehicleMeta(vt) {
  const v = String(vt || '').toUpperCase()
  return {
    image: VEHICLE_IMAGE[v] || vehicleCarImg,
    label: v || 'Auto',
  }
}

const FILTERS = [
  { key: 'all', i18n: 'all_rides' },
  { key: 'completed', i18n: 'completed' },
  { key: 'cancelled', i18n: 'cancelled' },
  { key: 'upcoming', i18n: 'upcoming' },
]

/** Accent config for the four summary stat cards (icon circle, glow line). */
const STAT_ACCENTS = {
  total: { icon: 'ri-file-text-line', circle: 'bg-amber-400/15 text-amber-400', glow: 'bg-amber-400' },
  completed: { icon: 'ri-checkbox-circle-line', circle: 'bg-emerald-400/15 text-emerald-400', glow: 'bg-emerald-400' },
  cancelled: { icon: 'ri-close-circle-line', circle: 'bg-rose-400/15 text-rose-400', glow: 'bg-rose-400' },
  upcoming: { icon: 'ri-time-line', circle: 'bg-sky-400/15 text-sky-400', glow: 'bg-sky-400' },
}

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------
const StatCard = ({ accent, label, value }) => {
  const a = STAT_ACCENTS[accent] || STAT_ACCENTS.total
  return (
    <div className="relative flex flex-col items-center gap-1.5 overflow-hidden rounded-xl border border-theme bg-theme-card px-2 py-3">
      <span className={`flex h-7 w-7 items-center justify-center rounded-full ${a.circle}`}>
        <i className={`${a.icon} text-sm`} />
      </span>
      <span className="text-xl font-bold text-theme-primary">{value}</span>
      <span className="text-center text-[0.65rem] leading-tight text-theme-muted">{label}</span>
      <span className={`absolute inset-x-0 bottom-0 h-0.5 ${a.glow}`} />
    </div>
  )
}

const RideCard = ({ ride, t, onView }) => {
  const sb = statusBadge(ride.status)
  const v = vehicleMeta(ride.vehicleType)
  const dt = rideDate(ride)
  const fare = `₹${Number(ride.fare) || 0}`
  const openDetail = () => onView(ride)

  return (
    <li
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openDetail()
        }
      }}
      className="group relative cursor-pointer rounded-xl border border-theme bg-theme-card p-3 shadow-sm outline-none transition-colors hover:bg-theme-card-muted"
      role="button"
      tabIndex={0}
      aria-label={`${t('view_ride')}: ${ride.destination}`}
    >
      <div className="flex items-center gap-3">
        {/* vehicle (perfect circle — no square edge) */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-theme-card-muted">
          <img src={v.image} alt={v.label} className="h-full w-full object-cover" />
        </div>

        {/* trip details */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              <p className="truncate text-sm font-semibold text-theme-primary">{ride.pickup}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="my-0.5 block h-3 w-px border-l border-dashed border-theme-strong" />
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
              <p className="truncate text-xs text-theme-muted">{ride.destination}</p>
            </div>
          </div>
          {/* date / time + passenger (single compact row) */}
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-theme-muted">
            <i className="ri-calendar-2-line text-xs" />
            <span className="truncate">{dt || '—'}</span>
            <span className="text-theme-muted">|</span>
            <i className="ri-user-line text-xs" />
            <span className="shrink-0">
              {ride.passengers} Passenger{ride.passengers > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* fare + status (right-aligned column) */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-base font-bold text-theme-primary">{fare}</span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${sb.className}`}
          >
            {sb.label}
          </span>
        </div>

        {/* view chevron (far right, vertically centered) */}
        <i className="ri-arrow-right-s-line shrink-0 text-theme-muted transition-colors group-hover:text-theme-primary" />
      </div>
    </li>
  )
}

const RideDetailModal = ({ ride, t, onClose }) => {
  const sb = statusBadge(ride.status)
  const v = vehicleMeta(ride.vehicleType)
  const dt = rideDate(ride)
  const cancelled = ride.status === 'cancelled'
  const baseAmount = `₹${Number(ride.fare) || 0}`
  const amount = cancelled ? `₹${Number(ride.cancellationFee) || 0}` : baseAmount

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-t-2xl border-t border-theme bg-theme-bg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute left-1/2 top-3 h-1.5 w-12 -translate-x-1/2 rounded-full bg-theme-muted" />

        <div className="mt-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-theme-primary">{t('ride_details')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-theme-muted hover:bg-theme-card-muted hover:text-theme-primary"
            aria-label={t('close')}
          >
            <i className="ri-close-line text-xl" />
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-theme-card-muted">
              <img src={v.image} alt={v.label} className="h-full w-full object-cover" />
            </span>
            <span className="text-sm font-medium text-theme-primary">{v.label}</span>
          </div>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${sb.className}`}>
            {sb.label}
          </span>
        </div>

        {dt ? <p className="mt-3 text-xs text-theme-muted">{dt}</p> : null}

        <div className="mt-3 flex items-start gap-2.5">
          <div className="flex flex-col items-center">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
            <i className="ri-arrow-down-line text-xs text-theme-muted" />
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs text-theme-muted">{t('pickup')}</p>
              <p className="break-words text-sm text-theme-primary">{ride.pickup}</p>
            </div>
            <div>
              <p className="text-xs text-theme-muted">{t('drop')}</p>
              <p className="break-words text-sm text-theme-primary">{ride.destination}</p>
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-1.5 text-sm">
          {ride.distance || ride.duration ? (
            <div className="flex justify-between">
              <span className="text-theme-secondary">{t('distance_duration')}</span>
              <span className="text-theme-primary">
                {[ride.distance, ride.duration].filter(Boolean).join(' · ')}
              </span>
            </div>
          ) : null}
          {ride.paymentMethod ? (
            <div className="flex justify-between">
              <span className="text-theme-secondary">{t('payment_method')}</span>
              <span className="text-theme-primary">{ride.paymentMethod}</span>
            </div>
          ) : null}
          {ride.rating != null ? (
            <div className="flex justify-between">
              <span className="text-theme-secondary">{t('rating')}</span>
              <span className="flex items-center gap-1 text-theme-primary">
                <i className="ri-star-fill text-brand" /> {ride.rating}
              </span>
            </div>
          ) : null}
          {ride.captain?.name ? (
            <div className="flex justify-between">
              <span className="text-theme-secondary">{t('driver')}</span>
              <span className="text-theme-primary">{ride.captain.name}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-theme pt-4">
          <span className="text-sm text-theme-secondary">
            {cancelled ? t('cancellation_fee') : t('total_fare')}
          </span>
          <span
            className={`text-xl font-semibold ${cancelled ? 'text-red-500' : 'text-brand'}`}
          >
            {amount}
          </span>
        </div>

        {!cancelled && ride.id ? (
          <div className="mt-4">
            <Link
              to={`/invoice/${ride.id}`}
              state={{ from: 'history' }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-theme bg-theme-card px-3 py-2.5 text-sm font-semibold text-theme-primary transition-colors hover:bg-theme-card-muted"
            >
              <i className="ri-file-list-3-line text-sm" aria-hidden />
              {t('view_invoice')}
            </Link>
          </div>
        ) : null}

        <div className="mt-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-brand py-2.5 text-sm font-bold text-brand-ink hover:bg-brand-light"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
const RideHistory = () => {
  const { t } = useLanguage()
  const [rides, setRides] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [detailRide, setDetailRide] = useState(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [dateFilter, setDateFilter] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth() }
  })
  const [calView, setCalView] = useState('days') // 'days' | 'months' | 'years'
  const [calYearOffset, setCalYearOffset] = useState(0)
  const mountedRef = useRef(true)

  const loadRides = useCallback(() => {
    setLoading(true)
    setError('')
    return apiClient
      .get('/rides/history', withAuth({ params: { limit: 50 } }))
      .then((res) => {
        if (!mountedRef.current) return
        const raw = stripApiEnvelope(res.data)
        const list = Array.isArray(raw?.rides)
          ? raw.rides
          : Array.isArray(raw)
            ? raw
            : []
        setRides(list)
      })
      .catch((err) => {
        if (!mountedRef.current) return
        setError(formatApiError(err))
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false)
      })
  }, [])

  useEffect(() => {
    mountedRef.current = true
    loadRides()
    return () => { mountedRef.current = false }
  }, [loadRides])

  const items = useMemo(() => {
    const src = rides.length > 0 ? rides : loading ? [] : demoRideHistory
    return src.map(normalizeRide)
  }, [rides, loading])

  const unreachable = !!error && rides.length === 0

  const stats = useMemo(
    () => ({
      total: items.length,
      completed: items.filter((r) => r.status === 'completed').length,
      cancelled: items.filter((r) => r.status === 'cancelled').length,
      upcoming: items.filter((r) => ACTIVE_STATUSES.has(r.status)).length,
    }),
    [items],
  )

  const rideDates = useMemo(() => {
    const s = new Set()
    items.forEach((r) => {
      const k = rideDateKey(r)
      if (k) s.add(k)
    })
    return s
  }, [items])

  const displayed = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((r) => {
      if (activeFilter === 'completed' && r.status !== 'completed') return false
      if (activeFilter === 'cancelled' && r.status !== 'cancelled') return false
      if (activeFilter === 'upcoming' && !ACTIVE_STATUSES.has(r.status)) return false
      if (dateFilter) {
        const d = rideDateKey(r)
        if (!d || d !== dateFilter) return false
      }
      if (q) {
        const hay = [
          rideDate(r),
          r.pickup,
          r.destination,
          r.vehicleType,
          r.status,
          r.captain?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, activeFilter, query, dateFilter])

  return (
    <div className="min-h-dvh min-h-screen w-full max-w-full overflow-x-hidden bg-theme-bg text-theme-primary pb-24">
      {/* header */}
      <header className="sticky top-0 z-20 border-b border-theme bg-theme-bg/95 px-3 py-3 backdrop-blur sm:px-4">
        <div className="mx-auto flex w-full max-w-lg items-center gap-2 sm:gap-3">
          <Link
            to="/home"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-theme-card text-theme-secondary"
            aria-label="Back"
          >
            <i className="ri-arrow-left-line text-lg" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-theme-primary sm:text-lg">{t('ride_history')}</h1>
            <p className="text-xs text-theme-muted">{t('your_past_trips')}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCalendar((s) => !s)}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              showCalendar ? 'bg-brand text-brand-ink' : 'bg-theme-card text-theme-secondary hover:bg-theme-card-muted'
            }`}
            aria-label="Calendar"
            title="Calendar"
          >
            <i className="ri-calendar-2-line text-lg" />
          </button>
        </div>
      </header>

      {/* real calendar filter */}
      {showCalendar ? (
        <div className="border-b border-theme bg-theme-bg/95 px-3 py-3 sm:px-4">
          <div className="mx-auto w-full max-w-lg">
            <div className="flex items-center justify-between">
              {calView === 'days' ? (
                <button
                  type="button"
                  onClick={() => setCalView('years')}
                  className="rounded-lg px-1 py-0.5 text-sm font-semibold text-theme-primary hover:bg-theme-card-muted focus:outline-none"
                  title="Choose year and month"
                >
                  {new Date(calendarMonth.y, calendarMonth.m).toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                  <i className="ri-arrow-down-s-line ml-0.5 text-xs text-theme-muted" />
                </button>
              ) : calView === 'months' ? (
                <button
                  type="button"
                  onClick={() => setCalView('years')}
                  className="rounded-lg px-1 py-0.5 text-sm font-semibold text-theme-primary hover:bg-theme-card-muted focus:outline-none"
                >
                  {calendarMonth.y}
                  <i className="ri-arrow-down-s-line ml-0.5 text-xs text-theme-muted" />
                </button>
              ) : (
                <p className="text-sm font-semibold text-theme-primary">Select year</p>
              )}

              <div className="flex items-center gap-1">
                {dateFilter ? (
                  <button
                    type="button"
                    onClick={() => setDateFilter('')}
                    className="text-xs font-medium text-brand"
                  >
                    Clear
                  </button>
                ) : null}

                {calView === 'days' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(calendarMonth.y, calendarMonth.m - 1)
                        setCalendarMonth({ y: d.getFullYear(), m: d.getMonth() })
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-theme-card text-theme-secondary hover:bg-theme-card-muted"
                      aria-label="Previous month"
                    >
                      <i className="ri-arrow-left-s-line text-lg" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(calendarMonth.y, calendarMonth.m + 1)
                        setCalendarMonth({ y: d.getFullYear(), m: d.getMonth() })
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-theme-card text-theme-secondary hover:bg-theme-card-muted"
                      aria-label="Next month"
                    >
                      <i className="ri-arrow-right-s-line text-lg" />
                    </button>
                  </>
                ) : null}

                {calView === 'years' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setCalYearOffset((o) => o - 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-theme-card text-theme-secondary hover:bg-theme-card-muted"
                      aria-label="Previous years"
                    >
                      <i className="ri-arrow-left-s-line text-lg" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalYearOffset((o) => o + 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-theme-card text-theme-secondary hover:bg-theme-card-muted"
                      aria-label="Next years"
                    >
                      <i className="ri-arrow-right-s-line text-lg" />
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {calView === 'days' ? (
              <>
                <div className="mt-3 grid grid-cols-7 text-center text-[11px] font-medium text-theme-muted">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <span key={d} className="py-1">{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-1">
                  {(() => {
                    const first = new Date(calendarMonth.y, calendarMonth.m, 1)
                    const startPad = first.getDay()
                    const daysInMonth = new Date(calendarMonth.y, calendarMonth.m + 1, 0).getDate()
                    const cells = []
                    for (let i = 0; i < startPad; i += 1) cells.push(<span key={`pad-${i}`} />)
                    const todayKey = new Date().toISOString().slice(0, 10)
                    for (let d = 1; d <= daysInMonth; d += 1) {
                      const key = `${calendarMonth.y}-${String(calendarMonth.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                      const hasRides = rideDates.has(key)
                      const selected = dateFilter === key
                      const isToday = key === todayKey
                      cells.push(
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setDateFilter((cur) => (cur === key ? '' : key))
                            setShowCalendar(false)
                          }}
                          className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors focus:outline-none ${
                            selected
                              ? 'bg-brand font-bold text-brand-ink'
                              : hasRides
                                ? 'bg-brand/15 font-semibold text-brand'
                                : isToday
                                  ? 'border border-theme-strong text-theme-primary'
                                  : 'text-theme-muted hover:bg-theme-card-muted hover:text-theme-primary'
                          }`}
                        >
                          {d}
                        </button>,
                      )
                    }
                    return cells
                  })()}
                </div>
              </>
            ) : null}

            {calView === 'months' ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, idx) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setCalendarMonth((cur) => ({ ...cur, m: idx }))
                      setCalView('days')
                    }}
                    className={`rounded-xl border py-2.5 text-sm font-medium transition-colors focus:outline-none ${
                      calendarMonth.m === idx
                        ? 'border-brand bg-brand/15 text-brand'
                        : 'border-theme bg-theme-card text-theme-secondary hover:bg-theme-card-muted'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            ) : null}

            {calView === 'years' ? (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {(() => {
                  const base = new Date().getFullYear() + calYearOffset * 12
                  const cells = []
                  for (let i = 0; i < 12; i += 1) {
                    const y = base + i
                    cells.push(
                      <button
                        key={y}
                        type="button"
                        onClick={() => {
                          setCalendarMonth((cur) => ({ ...cur, y }))
                          setCalView('months')
                        }}
                        className={`rounded-xl border py-2.5 text-sm font-medium transition-colors focus:outline-none ${
                          calendarMonth.y === y
                            ? 'border-brand bg-brand/15 text-brand'
                            : 'border-theme bg-theme-card text-theme-secondary hover:bg-theme-card-muted'
                        }`}
                      >
                        {y}
                      </button>,
                    )
                  }
                  return cells
                })()}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-lg px-3 pt-3 sm:px-4">
        {unreachable ? (
          <div
            role="status"
            className="mb-3 rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-xs text-brand"
          >
            {t('sample_data_notice')}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-theme-secondary">
            <i className="ri-loader-4-line animate-spin text-base" />
            <span>{t('loading')}</span>
          </div>
        ) : null}

        {!loading ? (
          <div className="mb-3 grid grid-cols-4 gap-2">
            <StatCard accent="total" label={t('total_rides')} value={stats.total} />
            <StatCard accent="completed" label={t('completed')} value={stats.completed} />
            <StatCard accent="cancelled" label={t('cancelled')} value={stats.cancelled} />
            <StatCard accent="upcoming" label={t('upcoming')} value={stats.upcoming} />
          </div>
        ) : null}

        {!loading ? (
          <nav
            className="mb-3 grid grid-cols-4 gap-1.5"
            aria-label="Filter rides"
          >
            {FILTERS.map((f) => {
              const active = activeFilter === f.key
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setActiveFilter(f.key)}
                  className={`flex w-full items-center justify-center whitespace-nowrap rounded-full px-1 py-2 text-[13px] font-semibold transition-colors focus:outline-none ${
                    active
                      ? 'bg-brand text-brand-ink shadow-[0_0_16px_rgba(255,168,0,0.35)]'
                      : 'border border-theme bg-theme-card text-theme-muted hover:bg-theme-card-muted hover:text-theme-primary'
                  }`}
                >
                  {t(f.i18n)}
                </button>
              )
            })}
          </nav>
        ) : null}

        {!loading ? (
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
              <input
                id="ride-history-search"
                type="search"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('search_rides')}
                className="w-full rounded-xl border border-theme bg-theme-input pl-9 pr-3 py-2.5 text-sm text-theme-primary placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-brand/50"
              />
            </div>
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-theme bg-theme-card text-theme-secondary hover:bg-theme-card-muted"
              aria-label="Filter"
              title="Filter"
            >
              <i className="ri-filter-2-line text-lg" />
            </button>
          </div>
        ) : null}

        {!loading && displayed.length === 0 ? (
          <div className="py-10 text-center">
            <i className="ri-ride-line mb-2 text-4xl text-sky-500/70" />
            <p className="text-sm font-medium text-theme-secondary">{t('no_rides_found')}</p>
            <p className="mt-1 text-xs text-theme-muted">{t('no_rides_sub')}</p>
          </div>
        ) : null}

        {!loading && displayed.length > 0 ? (
          <ul className="space-y-3">
            {displayed.map((r) => (
              <RideCard key={r.id} ride={r} t={t} onView={setDetailRide} />
            ))}
          </ul>
        ) : null}

        {!loading ? (
          <div className="mt-5 rounded-xl border border-theme bg-theme-card p-4 text-center">
            <p className="text-sm font-medium text-theme-secondary">{t('cant_find_ride')}</p>
            <p className="mt-0.5 text-xs text-theme-muted">{t('check_older_dates')}</p>
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className="mt-3 inline-flex items-center gap-1 rounded-full bg-brand px-5 py-2 text-sm font-bold text-brand-ink transition-colors hover:bg-brand-light"
            >
              {t('view_past_rides')}
            </button>
          </div>
        ) : null}
      </div>

      {detailRide ? <RideDetailModal ride={detailRide} t={t} onClose={() => setDetailRide(null)} /> : null}
    </div>
  )
}

export default RideHistory
