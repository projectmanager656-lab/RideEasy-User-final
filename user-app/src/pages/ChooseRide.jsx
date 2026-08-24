import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import RideMap from '../components/RideMap'
import ScheduleModal from '../components/ScheduleModal'
import { RIDE_TIERS, findRideTier } from '../constants/rideTiers'
import { apiClient, withAuth } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'
import { formatApiError } from '../utils/apiError'
import { fetchOsrmDrivingRoute } from '../utils/osrmClient'
import logoAuto from '../assets/logo-auto.png'
import logoCar from '../assets/logo-car.png'
import logoPremium from '../assets/premium.png'
import logoBike from '../assets/logo-bike.png'

const USER_RIDE_SESSION_KEY = 'rideeasy_user_ride'

function formatDistance (meters) {
    if (!Number.isFinite(meters) || meters < 0) return ''
    if (meters < 1000) return `${Math.max(1, Math.round(meters))} m`
    return `${(meters / 1000).toFixed(1)} km`
}

function formatDuration (seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return ''
    const totalMin = Math.max(1, Math.round(seconds / 60))
    if (totalMin < 60) return `${totalMin} min`
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return m ? `${h} hr ${m} min` : `${h} hr`
}

function formatPrice (n) {
    const v = Number(n)
    if (!Number.isFinite(v) || v <= 0) return null
    return `₹${v.toFixed(2)}`
}

function formatArrival (minutes) {
    return new Date(Date.now() + minutes * 60_000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const PAYMENT_METHODS = [ 'Cash', 'UPI' ]

/** Ride facilities shown on Choose Ride, each with its branded logo. */
const RIDE_OPTIONS = [
    { tier: findRideTier('BIKE'), logo: logoBike },
    { tier: findRideTier('ECONOMY'), logo: logoAuto },
    { tier: findRideTier('COMFORT'), logo: logoCar },
    { tier: findRideTier('PREMIUM'), logo: logoPremium },
].filter((o) => o.tier)

const ChooseRide = () => {
    const navigate = useNavigate()
    const location = useLocation()
    const state = location.state || {}

    const [ pickupCoords ] = useState(state.pickupCoords || state.pickupCoordinate || null)
    const [ dropCoords ] = useState(state.dropCoords || state.dropCoordinate || null)
    const pickup = state.pickup || ''
    const destination = state.drop || state.destination || ''

    const [ fare, setFare ] = useState(state.fare || null)
    const [ fareLoading, setFareLoading ] = useState(!state.fare)
    const [ fareError, setFareError ] = useState('')

    const [ routeStats, setRouteStats ] = useState(null)
    const [ routeLoading, setRouteLoading ] = useState(true)
    const [ routeError, setRouteError ] = useState(false)

    const [ selectedTier, setSelectedTier ] = useState(() => RIDE_OPTIONS[0]?.tier || RIDE_TIERS[0] || null)
    const [ paymentOpen, setPaymentOpen ] = useState(false)
    const [ paymentMethod, setPaymentMethod ] = useState('Cash')
    const [ scheduleOpen, setScheduleOpen ] = useState(false)
    const [ scheduledAt, setScheduledAt ] = useState(null)
    const [ booking, setBooking ] = useState(false)
    const [ bookingError, setBookingError ] = useState('')

    const hasRoute = !!(
        pickupCoords?.lat != null && pickupCoords?.lng != null
        && dropCoords?.lat != null && dropCoords?.lng != null
    )

    /** Load fare from backend unless Home already passed it through. */
    useEffect(() => {
        if (fare && Object.keys(fare).length > 0) return
        if (!hasRoute || !pickup || !destination) {
            setFareLoading(false)
            return
        }
        let cancelled = false
        setFareLoading(true)
        setFareError('')
        apiClient
            .get('/rides/get-fare', withAuth({
                params: {
                    pickup,
                    destination,
                    pickupLat: pickupCoords.lat,
                    pickupLng: pickupCoords.lng,
                    dropLat: dropCoords.lat,
                    dropLng: dropCoords.lng,
                },
            }))
            .then((res) => {
                if (cancelled) return
                setFare(stripApiEnvelope(res.data) || {})
            })
            .catch((err) => {
                if (cancelled) return
                setFareError(formatApiError(err))
            })
            .finally(() => {
                if (!cancelled) setFareLoading(false)
            })
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ hasRoute, pickup, destination ])

    /** Fetch route distance + duration for the summary chip. */
    useEffect(() => {
        if (!hasRoute) {
            setRouteLoading(false)
            return
        }
        let cancelled = false
        setRouteLoading(true)
        setRouteError(false)
        fetchOsrmDrivingRoute(
            Number(pickupCoords.lng),
            Number(pickupCoords.lat),
            Number(dropCoords.lng),
            Number(dropCoords.lat),
            { overview: 'simplified' }
        )
            .then((data) => {
                if (cancelled) return
                setRouteStats({
                    distanceMeters: data.distanceMeters,
                    durationSeconds: data.durationSec,
                })
                setRouteError(false)
            })
            .catch(() => {
                if (cancelled) return
                setRouteStats(null)
                setRouteError(true)
            })
            .finally(() => {
                if (!cancelled) setRouteLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [ hasRoute, pickupCoords?.lat, pickupCoords?.lng, dropCoords?.lat, dropCoords?.lng ])

    const tiers = useMemo(() => {
        const hasFare = fare && Object.keys(fare).length > 0
        return RIDE_OPTIONS.map((o) => {
            const t = o.tier
            const backendPrice = hasFare ? (fare[t.vehicleType] ?? fare[String(t.vehicleType).toUpperCase()]) : undefined
            const price = backendPrice != null && Number(backendPrice) > 0 ? backendPrice : (t.fare || null)
            return { ...t, logo: o.logo, price }
        })
    }, [ fare ])

    const cheapest = useMemo(() => {
        const priced = tiers.filter((t) => t.price != null && Number(t.price) > 0)
        if (priced.length === 0) return null
        return priced.reduce((a, b) => (Number(a.price) <= Number(b.price) ? a : b))
    }, [ tiers ])

    const selected = selectedTier || null

    const handleGoBack = () => {
        if (window.history.length > 1) navigate(-1)
        else navigate('/home')
    }

    const retryRoute = () => {
        // Toggling a no-op dependency re-runs the route effect via state bump below.
        setRouteError(false)
        setRouteStats(null)
        setRouteLoading(true)
        // Re-trigger effect by re-running with current coords.
        const { lng: olng, lat: olat } = pickupCoords
        const { lng: dlng, lat: dlat } = dropCoords
        fetchOsrmDrivingRoute(Number(olng), Number(olat), Number(dlng), Number(dlat), { overview: 'simplified' })
            .then((data) => {
                setRouteStats({ distanceMeters: data.distanceMeters, durationSeconds: data.durationSec })
                setRouteError(false)
            })
            .catch(() => {
                setRouteStats(null)
                setRouteError(true)
            })
            .finally(() => setRouteLoading(false))
    }

    const retryFare = () => {
        setFare(null)
        setFareLoading(true)
        setFareError('')
        apiClient
            .get('/rides/get-fare', withAuth({
                params: {
                    pickup,
                    destination,
                    pickupLat: pickupCoords.lat,
                    pickupLng: pickupCoords.lng,
                    dropLat: dropCoords.lat,
                    dropLng: dropCoords.lng,
                },
            }))
            .then((res) => setFare(stripApiEnvelope(res.data) || {}))
            .catch((err) => setFareError(formatApiError(err)))
            .finally(() => setFareLoading(false))
    }

    const handleConfirm = async () => {
        if (!selected || !hasRoute) return
        const tier = selected
        const vehicleType = tier.vehicleType
        const price = Number(tier.price) > 0 ? tier.price : null
        if (price == null) {
            setBookingError('Fare unavailable. Please try again.')
            return
        }
        setBookingError('')
        setBooking(true)
        try {
            const res = await apiClient.post('/rides/create', {
                pickupLocation: pickup,
                dropLocation: destination,
                ...(pickupCoords?.lat != null && pickupCoords?.lng != null
                    ? { pickupLat: pickupCoords.lat, pickupLng: pickupCoords.lng }
                    : {}),
                ...(dropCoords?.lat != null && dropCoords?.lng != null
                    ? { dropLat: dropCoords.lat, dropLng: dropCoords.lng }
                    : {}),
                vehicleType,
                paymentMethod: paymentMethod || 'Cash',
                price,
                distanceKm: fare?.distanceKm != null ? fare.distanceKm : (routeStats?.distanceMeters != null ? routeStats.distanceMeters / 1000 : undefined),
                ...(scheduledAt ? { scheduledAt } : {}),
            }, withAuth())
            const raw = stripApiEnvelope(res.data)
            const ridePayload = { ...raw }
            delete ridePayload.otp
            if (ridePayload?._id) {
                try {
                    sessionStorage.setItem(USER_RIDE_SESSION_KEY, String(ridePayload._id))
                } catch { /* ignore */ }
            }
            navigate('/home', {
                replace: true,
                state: {
                    chooseRideResult: {
                        ride: ridePayload,
                        pickupCoords,
                        dropCoords,
                        pickup,
                        destination,
                        vehicleType,
                        paymentMethod,
                        price,
                        scheduledAt,
                    },
                },
            })
        } catch (err) {
            setBookingError(formatApiError(err))
        } finally {
            setBooking(false)
        }
    }

    if (!hasRoute) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black px-8 text-center text-white">
                <i className="ri-roadster-line text-4xl text-brand-yellow" aria-hidden />
                <p className="text-sm text-zinc-300">Ride details are not available.</p>
                <p className="text-xs text-zinc-500">Select your pickup and drop locations first.</p>
                <button
                    type="button"
                    onClick={() => navigate('/home')}
                    className="rounded-xl border border-brand-yellow bg-brand-yellow px-6 py-3 text-sm font-bold text-black active:scale-[0.98]"
                >
                    Back to Home
                </button>
            </div>
        )
    }

    return (
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-black text-white">
            {/* Map */}
            <div className="relative h-[44%] min-h-[260px] w-full shrink-0 overflow-hidden">
                <RideMap
                    pickupCoords={pickupCoords}
                    dropCoords={dropCoords}
                    showRoute
                    showRouteStatsChip={false}
                    zoomControlPosition="topright"
                />

                {/* Slight map fade to draw focus to the ride card */}
                <div className="pointer-events-none absolute inset-0 z-[900] bg-gradient-to-b from-black/10 via-black/20 to-black/40" aria-hidden />

                {/* Back button */}
                <button
                    type="button"
                    onClick={handleGoBack}
                    aria-label="Back"
                    className="absolute left-4 top-4 z-[1000] flex h-10 w-10 items-center justify-center rounded-full border border-brand-border bg-black/80 text-white shadow-lg backdrop-blur-sm active:scale-95"
                >
                    <i className="ri-arrow-left-line text-lg" aria-hidden />
                </button>

                {/* Route summary chip */}
                {!routeLoading && routeStats && (
                    <div className="pointer-events-none absolute left-1/2 top-4 z-[1000] -translate-x-1/2">
                        <div
                            className="flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 shadow-lg"
                            style={{ background: 'rgba(10,10,10,0.92)', borderColor: '#2A2A2A' }}
                        >
                            <i className="ri-roadster-line text-brand-yellow" aria-hidden />
                            <span className="text-sm font-bold">
                                {formatDuration(routeStats.durationSeconds)}
                            </span>
                            <span className="text-xs text-[#9A9A9A]" aria-hidden>•</span>
                            <span className="text-sm font-semibold">
                                {formatDistance(routeStats.distanceMeters)}
                            </span>
                        </div>
                    </div>
                )}

                {/* Route stats overlay states */}
                {routeLoading && (
                    <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-4 py-6">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-yellow border-t-transparent" />
                        <span className="text-xs text-zinc-200">Loading route...</span>
                    </div>
                )}
                {!routeLoading && routeError && (
                    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 bg-black/70 px-4 py-4 backdrop-blur-sm">
                        <p className="text-xs text-zinc-300">Unable to load route. Please try again.</p>
                        <button
                            type="button"
                            onClick={retryRoute}
                            className="rounded-full border border-brand-yellow px-3 py-1 text-xs font-semibold text-brand-yellow active:scale-95"
                        >
                            Retry
                        </button>
                    </div>
                )}
            </div>

            {/* Bottom sheet */}
            <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[28px] border-t border-brand-border bg-[#101010] shadow-[0_-8px_40px_rgba(0,0,0,0.45)]">
                <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-zinc-700" />

                {/* Scrollable ride content */}
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <h2 className="mb-3 mt-3 text-lg font-bold text-white">Choose a ride</h2>

                    {/* Fare loading / error */}
                    {fareLoading && (
                        <p className="flex items-center gap-2 py-2 text-xs text-zinc-400">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-yellow border-t-transparent" />
                            Getting fare...
                        </p>
                    )}
                    {!fareLoading && fareError && (
                        <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-border bg-brand-card px-3 py-2.5">
                            <p className="text-xs text-zinc-400">Unable to fetch fare.</p>
                            <button
                                type="button"
                                onClick={retryFare}
                                className="rounded-full border border-brand-yellow px-3 py-1 text-xs font-semibold text-brand-yellow active:scale-95"
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    {/* Ride options */}
                    <div className="space-y-2.5">
                        {tiers.map((tier) => {
                            const isSelected = selected?.id === tier.id
                            const isCheapest = cheapest?.id === tier.id
                            const priceText = formatPrice(tier.price)
                            return (
                                <button
                                    key={tier.id}
                                    type="button"
                                    onClick={() => setSelectedTier(tier)}
                                    className={[
                                        'flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition active:scale-[0.99]',
                                        isSelected
                                            ? 'border-brand-yellow bg-brand-card'
                                            : 'border-brand-border bg-brand-card/40',
                                    ].join(' ')}
                                >
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center">
                                        <img src={tier.logo} alt={tier.label} className="h-9 w-9 object-contain" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-2">
                                            <span className="truncate text-sm font-bold text-white">{tier.label}</span>
                                            {isCheapest && tier.price != null && (
                                                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                                                    Cheaper
                                                </span>
                                            )}
                                        </span>
                                        <span className="mt-1 flex items-center gap-1.5 text-xs text-[#9A9A9A]">
                                            <i className="ri-group-line" aria-hidden />
                                            <span>Seats {tier.capacity}</span>
                                        </span>
                                        <span className="mt-0.5 block text-xs text-zinc-400">
                                            {formatArrival(tier.etaMinutes)} · {tier.etaMinutes} min
                                        </span>
                                    </span>
                                    <span className="flex shrink-0 flex-col items-end gap-1">
                                        <span className="text-sm font-bold text-white">
                                            {priceText ?? '—'}
                                        </span>
                                        {isSelected && (
                                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-yellow text-black">
                                                <i className="ri-check-line text-xs" aria-hidden />
                                            </span>
                                        )}
                                    </span>
                                </button>
                            )
                        })}
                    </div>

                    {bookingError && (
                        <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{bookingError}</p>
                    )}
                </div>

                {/* Payment + action footer */}
                <div className="shrink-0 border-t border-brand-border px-4 pb-4 pt-3">
                    {/* Payment method row */}
                    <button
                        type="button"
                        onClick={() => setPaymentOpen(true)}
                        className="mb-3 flex w-full items-center justify-between rounded-xl border border-brand-border bg-brand-card px-3.5 py-3 transition active:scale-[0.99]"
                    >
                        <span className="flex items-center gap-3">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
                                <i className="ri-money-rupee-circle-line text-lg" aria-hidden />
                            </span>
                            <span className="text-sm font-semibold text-white">{paymentMethod}</span>
                        </span>
                        <i className="ri-arrow-right-s-line text-xl text-zinc-500" aria-hidden />
                    </button>

                    <div className="flex items-stretch gap-2">
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={!selected || booking}
                            className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-yellow px-4 py-3.5 text-sm font-bold text-black transition active:scale-[0.99] disabled:opacity-50"
                        >
                            {booking ? (
                                <>
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                                    Booking...
                                </>
                            ) : (
                                <>Choose Ride</>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setScheduleOpen(true)}
                            aria-label="Schedule ride"
                            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl border border-brand-border bg-brand-card text-brand-yellow transition active:scale-95"
                        >
                            <i className="ri-calendar-line text-xl" aria-hidden />
                        </button>
                    </div>
                </div>
            </div>

            {/* Payment method sheet */}
            {paymentOpen && (
                <div className="absolute inset-0 z-[60] flex items-end justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px]" onClick={() => setPaymentOpen(false)} aria-hidden />
                    <div className="relative w-full max-w-[430px] rounded-t-2xl border-t border-brand-border bg-[#101010] p-4 pb-6">
                        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-700" />
                        <h3 className="mb-3 text-base font-bold text-white">Payment method</h3>
                        <div className="space-y-2">
                            {PAYMENT_METHODS.map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => {
                                        setPaymentMethod(m)
                                        setPaymentOpen(false)
                                    }}
                                    className={[
                                        'flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-sm font-semibold text-white transition active:scale-[0.99]',
                                        paymentMethod === m ? 'border-brand-yellow bg-brand-card' : 'border-brand-border bg-brand-card/40',
                                    ].join(' ')}
                                >
                                    <span className="flex items-center gap-3">
                                        <i className={m === 'Cash' ? 'ri-money-rupee-circle-line text-brand-yellow' : 'ri-bank-card-line text-brand-yellow'} aria-hidden />
                                        {m}
                                    </span>
                                    {paymentMethod === m && <i className="ri-check-line text-brand-yellow" aria-hidden />}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <ScheduleModal
                open={scheduleOpen}
                onClose={() => setScheduleOpen(false)}
                onContinue={(iso) => {
                    setScheduledAt(iso)
                    setScheduleOpen(false)
                }}
                findingTrip={false}
            />
        </div>
    )
}

export default ChooseRide