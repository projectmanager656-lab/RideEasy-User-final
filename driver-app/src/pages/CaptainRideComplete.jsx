import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { apiClient, withCaptainAuth } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'
import { formatApiError } from '../utils/apiError'
import { getPlaceholderAvatarUrl } from '../config/externalEndpoints'

const TAG_OPTIONS = [
    { id: 'rude', label: 'Rude passenger' },
    { id: 'wrong_location', label: 'Wrong location' },
    { id: 'no_issues', label: 'No issues' },
]

function formatKm (n) {
    if (n == null || !Number.isFinite(Number(n))) return '—'
    const v = Number(n)
    return `${Math.round(v * 10) / 10} km`
}

function formatDuration (sec) {
    if (sec == null || !Number.isFinite(Number(sec)) || Number(sec) < 0) return '—'
    const s = Math.round(Number(sec))
    if (s < 60) return `${s} sec`
    const m = Math.floor(s / 60)
    const r = s % 60
    return r ? `${m} min ${r} sec` : `${m} min`
}

function formatMoney (n) {
    if (n == null || !Number.isFinite(Number(n))) return '—'
    return `₹${Math.round(Number(n))}`
}

function normalizePersonName (user) {
    if (!user) return 'Rider'
    if (typeof user === 'string') return user
    if (typeof user.name === 'string') return user.name
    return 'Rider'
}

function userIdString (user) {
    if (!user) return ''
    if (typeof user === 'string') return user
    if (user._id != null) return String(user._id)
    return ''
}

const CaptainRideComplete = () => {
    const navigate = useNavigate()
    const location = useLocation()
    const initialRide = location.state?.ride
    const initialOtp = location.state?.startOtp
        || (() => {
            try {
                return sessionStorage.getItem('rideeasy_last_start_otp') || ''
            } catch {
                return ''
            }
        })()

    const [ ride, setRide ] = useState(initialRide)
    const [ earnings, setEarnings ] = useState(null)
    const [ passengerSummary, setPassengerSummary ] = useState(null)
    const [ loadError, setLoadError ] = useState('')
    const [ headerAnim, setHeaderAnim ] = useState(false)
    const [ rating, setRating ] = useState(0)
    const [ selectedTags, setSelectedTags ] = useState([])
    const [ ratingSubmitting, setRatingSubmitting ] = useState(false)
    const [ ratingDone, setRatingDone ] = useState(false)
    const [ markPaidBusy, setMarkPaidBusy ] = useState(false)
    const [ goOnlineBusy, setGoOnlineBusy ] = useState(false)

    const rideId = ride?._id != null ? String(ride._id) : ''

    useEffect(() => {
        const t = requestAnimationFrame(() => setHeaderAnim(true))
        return () => cancelAnimationFrame(t)
    }, [])

    const refreshRide = useCallback(async () => {
        if (!rideId) return
        try {
            const res = await apiClient.get(`/rides/${rideId}`, withCaptainAuth())
            setRide(stripApiEnvelope(res.data))
            setLoadError('')
        } catch (err) {
            setLoadError(formatApiError(err))
        }
    }, [rideId])

    useEffect(() => {
        if (!rideId) {
            navigate('/captain-home', { replace: true })
            return
        }
        refreshRide()
    }, [rideId, navigate, refreshRide])

    useEffect(() => {
        if (!rideId) return
        let cancelled = false
        apiClient.get('/captains/earnings', withCaptainAuth())
            .then((res) => {
                if (!cancelled) setEarnings(stripApiEnvelope(res.data))
            })
            .catch(() => {
                if (!cancelled) setEarnings(null)
            })
        return () => { cancelled = true }
    }, [rideId])

    const passengerUserId = useMemo(() => userIdString(ride?.user), [ride?.user])

    useEffect(() => {
        if (!passengerUserId) {
            setPassengerSummary(null)
            return
        }
        let cancelled = false
        apiClient.get('/captains/passenger-rating-summary', {
            ...withCaptainAuth(),
            params: { userId: passengerUserId },
        })
            .then((res) => {
                if (!cancelled) setPassengerSummary(stripApiEnvelope(res.data))
            })
            .catch(() => {
                if (!cancelled) setPassengerSummary(null)
            })
        return () => { cancelled = true }
    }, [passengerUserId, ride?.captainPassengerRating])

    useEffect(() => {
        if (ride?.captainPassengerRating != null) {
            setRatingDone(true)
            setRating(ride.captainPassengerRating)
        }
    }, [ride?.captainPassengerRating])

    const paymentMethod = String(ride?.paymentMethod || 'Cash').toUpperCase()
    const isCash = paymentMethod === 'CASH'
    const paymentSuccess = String(ride?.paymentStatus || '').toLowerCase() === 'success'
    const tripFare = ride?.price != null ? Number(ride.price) : null
    const platformFee = ride?.platformFee != null ? Number(ride.platformFee) : null
    const driverNet = ride?.captainNetEarning != null ? Number(ride.captainNetEarning) : null

    const completedAt = ride?.completedAt ? new Date(ride.completedAt) : null
    const completedLabel = completedAt && !Number.isNaN(completedAt.getTime())
        ? completedAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
        : '—'

    async function onMarkPaid () {
        if (!rideId) return
        setMarkPaidBusy(true)
        try {
            const res = await apiClient.post('/rides/confirm-passenger-paid', { rideId }, withCaptainAuth())
            setRide(stripApiEnvelope(res.data))
            const er = await apiClient.get('/captains/earnings', withCaptainAuth())
            setEarnings(stripApiEnvelope(er.data))
        } catch (err) {
            alert(formatApiError(err))
        } finally {
            setMarkPaidBusy(false)
        }
    }

    async function submitRating () {
        if (!rideId || rating < 1 || rating > 5) {
            alert('Choose a star rating (1–5).')
            return
        }
        setRatingSubmitting(true)
        try {
            const tags = selectedTags.length ? selectedTags : []
            const res = await apiClient.post('/rides/rate-passenger', {
                rideId,
                rating,
                tags,
            }, withCaptainAuth())
            setRide(stripApiEnvelope(res.data))
            setRatingDone(true)
        } catch (err) {
            alert(formatApiError(err))
        } finally {
            setRatingSubmitting(false)
        }
    }

    async function goOnlineAgain () {
        setGoOnlineBusy(true)
        try {
            await apiClient.post('/captains/status', { status: 'active' }, withCaptainAuth())
            navigate('/captain-home', { replace: true })
        } catch (err) {
            alert(formatApiError(err))
        } finally {
            setGoOnlineBusy(false)
        }
    }

    function toggleTag (id) {
        setSelectedTags((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [ ...prev, id ]))
    }

    if (!rideId) return null

    return (
        <div className="min-h-dvh min-h-screen bg-black text-zinc-100 pb-28">
            <header className="sticky top-0 z-10 border-b border-zinc-800/80 bg-black/90 px-4 py-3 backdrop-blur-md">
                <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
                    <h1 className="text-base font-semibold tracking-tight text-white">Ride completed</h1>
                    <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        RideEasy
                    </span>
                </div>
            </header>

            <main className="mx-auto max-w-lg space-y-4 px-4 pt-5">
                {loadError ? (
                    <p className="rounded-xl border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">{loadError}</p>
                ) : null}

                {/* Success header */}
                <section
                    className={[
                        'rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/50 to-zinc-950 p-5 text-center shadow-lg shadow-emerald-900/20 transition-all duration-700 ease-out',
                        headerAnim ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
                    ].join(' ')}
                >
                    <div
                        className={[
                            'mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-3xl text-white shadow-lg shadow-emerald-600/40 transition-transform duration-500',
                            headerAnim ? 'scale-100' : 'scale-50',
                        ].join(' ')}
                    >
                        <i className="ri-check-line" />
                    </div>
                    <h2 className="text-xl font-semibold text-white">Ride completed</h2>
                    <p className="mt-1 text-sm text-emerald-200/80">Great job — review earnings and payment below.</p>
                </section>

                {/* Trip summary */}
                <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-xl shadow-black/40">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Trip summary</h3>
                    <div className="space-y-3 text-sm">
                        <div className="flex gap-3">
                            <i className="ri-map-pin-user-fill mt-0.5 text-emerald-500" />
                            <div>
                                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Pickup</p>
                                <p className="font-medium text-zinc-100">{ride?.pickupLocation || '—'}</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <i className="ri-map-pin-2-fill mt-0.5 text-emerald-500" />
                            <div>
                                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Drop</p>
                                <p className="font-medium text-zinc-100">{ride?.dropLocation || '—'}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-1">
                            <div className="rounded-xl bg-zinc-900/80 px-3 py-2">
                                <p className="text-[11px] text-zinc-500">Distance</p>
                                <p className="text-lg font-semibold text-white">{formatKm(ride?.distance)}</p>
                            </div>
                            <div className="rounded-xl bg-zinc-900/80 px-3 py-2">
                                <p className="text-[11px] text-zinc-500">Duration</p>
                                <p className="text-lg font-semibold text-white">{formatDuration(ride?.duration)}</p>
                            </div>
                        </div>
                        <div className="rounded-xl bg-zinc-900/60 px-3 py-2">
                            <p className="text-[11px] text-zinc-500">Completed at</p>
                            <p className="font-medium text-zinc-200">{completedLabel}</p>
                        </div>
                    </div>
                </section>

                {/* Earnings */}
                <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-xl shadow-black/40">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Earnings</h3>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between border-b border-zinc-800/80 py-2">
                            <span className="text-zinc-400">Trip fare</span>
                            <span className="font-medium text-zinc-100">{formatMoney(tripFare)}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-800/80 py-2">
                            <span className="text-zinc-400">Platform fee</span>
                            <span className="font-medium text-zinc-100">
                                {paymentSuccess && platformFee != null ? formatMoney(platformFee) : paymentSuccess ? formatMoney(0) : '—'}
                            </span>
                        </div>
                        <div className="flex items-center justify-between rounded-xl bg-emerald-950/40 px-3 py-3">
                            <span className="text-sm font-medium text-emerald-100">Driver earnings</span>
                            <span className="text-2xl font-bold tabular-nums text-emerald-400">
                                {driverNet != null ? formatMoney(driverNet) : (
                                    <span className="text-base font-normal text-zinc-500">Pending</span>
                                )}
                            </span>
                        </div>
                    </div>
                </section>

                {/* Payment status */}
                <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-xl shadow-black/40">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Payment</h3>
                    {isCash ? (
                        <div className="flex items-center gap-2 text-emerald-400">
                            <i className="ri-checkbox-circle-fill text-xl" />
                            <span className="font-medium">Cash collected</span>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {paymentSuccess ? (
                                <div className="flex items-center gap-2 text-emerald-400">
                                    <i className="ri-checkbox-circle-fill text-xl" />
                                    <span className="font-medium">Payment received</span>
                                </div>
                            ) : (
                                <>
                                    <p className="text-sm text-amber-200/90">
                                        <i className="ri-time-line mr-1" />
                                        Waiting for payment ({paymentMethod})
                                    </p>
                                    <button
                                        type="button"
                                        disabled={markPaidBusy}
                                        onClick={onMarkPaid}
                                        className="w-full rounded-xl bg-amber-600 py-3 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                                    >
                                        {markPaidBusy ? 'Saving…' : 'Mark as paid'}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </section>

                {/* Daily progress */}
                {earnings ? (
                    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-xl shadow-black/40">
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Today</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl bg-zinc-900/80 px-3 py-2">
                                <p className="text-[11px] text-zinc-500">Rides</p>
                                <p className="text-xl font-semibold text-white">{earnings.todayRides ?? '—'}</p>
                            </div>
                            <div className="rounded-xl bg-zinc-900/80 px-3 py-2">
                                <p className="text-[11px] text-zinc-500">Earnings</p>
                                <p className="text-xl font-semibold text-emerald-400">
                                    {earnings.todayEarnings != null ? formatMoney(earnings.todayEarnings) : '—'}
                                </p>
                            </div>
                        </div>
                    </section>
                ) : null}

                {/* Passenger */}
                <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-xl shadow-black/40">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Passenger</h3>
                    <div className="flex items-center gap-3">
                        <img
                            className="h-14 w-14 rounded-full border border-zinc-700 object-cover"
                            src={getPlaceholderAvatarUrl()}
                            alt=""
                        />
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-white">{normalizePersonName(ride?.user)}</p>
                            <p className="text-xs text-zinc-500">
                                {passengerSummary?.ratedTrips > 0 && passengerSummary?.avgRating != null
                                    ? `Avg from your rated trips: ${passengerSummary.avgRating} ★ (${passengerSummary.ratedTrips})`
                                    : 'No prior ratings from you for this rider'}
                            </p>
                            <p className="mt-1 font-mono text-sm text-zinc-300">
                                OTP used: <span className="text-white">{initialOtp || '—'}</span>
                            </p>
                        </div>
                    </div>
                </section>

                {/* Rate passenger */}
                <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-xl shadow-black/40">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Rate passenger</h3>
                    {ratingDone ? (
                        <p className="text-sm text-emerald-400">
                            <i className="ri-check-line mr-1" />
                            Thanks — rating saved ({rating}★)
                        </p>
                    ) : (
                        <>
                            <div className="mb-3 flex gap-1">
                                { [ 1, 2, 3, 4, 5 ].map((star) => (
                                    <button
                                        key={star}
                                        type="button"
                                        aria-label={`${star} stars`}
                                        onClick={() => setRating(star)}
                                        className="rounded-lg p-1 text-2xl text-amber-400 transition hover:scale-110"
                                    >
                                        <i className={star <= rating ? 'ri-star-fill' : 'ri-star-line'} />
                                    </button>
                                ))}
                            </div>
                            <div className="mb-3 flex flex-wrap gap-2">
                                {TAG_OPTIONS.map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => toggleTag(t.id)}
                                        className={[
                                            'rounded-full border px-3 py-1 text-xs font-medium transition',
                                            selectedTags.includes(t.id)
                                                ? 'border-emerald-500 bg-emerald-950/50 text-emerald-200'
                                                : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500',
                                        ].join(' ')}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                disabled={ratingSubmitting || rating < 1}
                                onClick={submitRating}
                                className="w-full rounded-xl bg-zinc-100 py-3 text-sm font-semibold text-zinc-900 hover:bg-white disabled:opacity-50"
                            >
                                {ratingSubmitting ? 'Submitting…' : 'Submit rating'}
                            </button>
                        </>
                    )}
                </section>

                {/* Actions */}
                <section className="space-y-2 pb-4">
                    <button
                        type="button"
                        disabled={goOnlineBusy}
                        onClick={goOnlineAgain}
                        className="w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-500 disabled:opacity-50"
                    >
                        {goOnlineBusy ? 'Going online…' : 'Go online again'}
                    </button>
                    <Link
                        to="/captain/history"
                        className="flex w-full items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900/50 py-3.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
                    >
                        View ride history
                    </Link>
                    <Link
                        to="/captain-home"
                        className="flex w-full items-center justify-center rounded-xl border border-zinc-800 py-3.5 text-sm font-medium text-zinc-400 hover:text-white"
                    >
                        Back to dashboard
                    </Link>
                </section>
            </main>
        </div>
    )
}

export default CaptainRideComplete
