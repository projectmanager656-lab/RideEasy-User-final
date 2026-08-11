import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

function formatINR (n) {
    const x = Number(n)
    if (!Number.isFinite(x)) return '—'
    return `₹${Math.round(x).toLocaleString('en-IN')}`
}

function formatDuration (seconds) {
    const s = Number(seconds)
    if (!Number.isFinite(s) || s < 0) return '—'
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    const r = s % 60
    return r ? `${m} min ${r}s` : `${m} min`
}

function formatWhen (d) {
    if (!d) return '—'
    try {
        const dt = new Date(d)
        return dt.toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    } catch {
        return '—'
    }
}

function paymentMethodLabel (m) {
    const u = String(m || '').toUpperCase()
    if (u === 'UPI') return 'UPI / Online'
    if (u === 'WALLET') return 'Wallet'
    if (u === 'QR') return 'QR'
    return 'Cash'
}

/**
 * Passenger trip-complete UX: summary, pay (if needed), rating, receipt, book again + auto home.
 */
export default function RideCompletionFlow ({
    ride,
    paying,
    submittingRating,
    payError,
    rateError,
    selectedPaymentMethod,
    onSelectPayment,
    onPay,
    onSubmitRating,
    onHome,
    UPI_PAYEE,
    autoRedirectSec = 14,
}) {
    const [ ratingDraft, setRatingDraft ] = useState(0)
    const [ feedback, setFeedback ] = useState('')
    const [ skippedRating, setSkippedRating ] = useState(false)
    const [ secLeft, setSecLeft ] = useState(autoRedirectSec)

    const paid = ride?.paymentStatus === 'success'
    const canRate = paid && ride?.rating == null && !skippedRating
    const doneWithRating = Boolean(ride?.rating || skippedRating)

    useEffect(() => {
        if (!paid || !doneWithRating) return undefined
        setSecLeft(autoRedirectSec)
        let remaining = autoRedirectSec
        const id = window.setInterval(() => {
            remaining -= 1
            setSecLeft(remaining)
            if (remaining <= 0) {
                window.clearInterval(id)
                onHome()
            }
        }, 1000)
        return () => window.clearInterval(id)
    }, [ paid, doneWithRating, ride?.rating, skippedRating, autoRedirectSec, onHome ])

    const distanceKm = useMemo(() => {
        const d = Number(ride?.distance)
        return Number.isFinite(d) ? d : null
    }, [ ride?.distance ])

    const captain = ride?.captain
    const initial = (captain?.name || 'D').toString().charAt(0).toUpperCase()

    const handleRateSubmit = async (e) => {
        e.preventDefault()
        if (ratingDraft < 1 || ratingDraft > 5) return
        await onSubmitRating(ratingDraft, feedback.trim())
    }

    return (
        <div className="flex min-h-dvh flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-black text-slate-100">
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-slate-950/90 px-4 py-3 backdrop-blur">
                <Link
                    to="/home"
                    replace
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/10"
                    aria-label="Home"
                >
                    <i className="ri-home-5-line text-lg" />
                </Link>
                <span className="text-sm font-medium text-emerald-400/90">Trip complete</span>
                <span className="w-10" />
            </header>

            <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-28 pt-6">
                {/* Hero */}
                <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-5 ring-1 ring-emerald-500/20">
                    <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-2xl text-emerald-300">
                            <i className="ri-checkbox-circle-fill" />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold text-white">Ride completed</h1>
                            <p className="mt-1 text-sm text-emerald-100/80">Thanks for riding with RideEasy</p>
                        </div>
                    </div>
                </section>

                {/* Route */}
                <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Trip</h2>
                    <div className="space-y-4">
                        <div className="flex gap-3">
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                                <i className="ri-map-pin-2-fill text-sm" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-xs text-slate-500">Pickup</p>
                                <p className="text-sm font-medium text-white">{ride?.pickupLocation || '—'}</p>
                            </div>
                        </div>
                        <div className="ml-4 border-l border-dashed border-white/15 pl-5" />
                        <div className="flex gap-3">
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-600/50 text-slate-200">
                                <i className="ri-flag-fill text-sm" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-xs text-slate-500">Drop</p>
                                <p className="text-sm font-medium text-white">{ride?.dropLocation || '—'}</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
                        <div className="rounded-xl bg-black/30 px-2 py-3 text-center">
                            <p className="text-[10px] uppercase text-slate-500">Distance</p>
                            <p className="mt-1 text-sm font-semibold text-white">
                                {distanceKm != null ? `${distanceKm.toFixed(1)} km` : '—'}
                            </p>
                        </div>
                        <div className="rounded-xl bg-black/30 px-2 py-3 text-center">
                            <p className="text-[10px] uppercase text-slate-500">Duration</p>
                            <p className="mt-1 text-sm font-semibold text-white">{formatDuration(ride?.duration)}</p>
                        </div>
                        <div className="rounded-xl bg-black/30 px-2 py-3 text-center">
                            <p className="text-[10px] uppercase text-slate-500">Fare</p>
                            <p className="mt-1 text-sm font-semibold text-emerald-400">{formatINR(ride?.price)}</p>
                        </div>
                    </div>
                    <p className="mt-3 text-center text-xs text-slate-500">
                        Payment: <span className="font-medium text-slate-300">{paymentMethodLabel(ride?.paymentMethod)}</span>
                        {paid ? (
                            <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-300">Paid</span>
                        ) : (
                            <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-200">Pending</span>
                        )}
                    </p>
                </section>

                {/* Payment */}
                {!paid && (
                    <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                        <h2 className="mb-2 text-sm font-semibold text-amber-100">Complete payment</h2>
                        {payError ? (
                            <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{payError}</p>
                        ) : null}
                        <div className="grid grid-cols-3 gap-2">
                            {['Cash', 'UPI', 'Online'].map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    disabled={paying}
                                    onClick={() => onSelectPayment(m)}
                                    className={`rounded-xl py-2.5 text-sm font-medium transition ${
                                        selectedPaymentMethod === m
                                            ? 'bg-white text-slate-900'
                                            : 'bg-white/10 text-slate-200 ring-1 ring-white/10 hover:bg-white/15'
                                    }`}
                                >
                                    {m === 'Online' ? 'Online' : m}
                                </button>
                            ))}
                        </div>
                        {(selectedPaymentMethod === 'UPI' || selectedPaymentMethod === 'Online') && (
                            <div className="mt-3 space-y-1 text-xs text-slate-400">
                                <p>
                                    Pay driver directly — UPI:{' '}
                                    <span className="font-semibold text-slate-200">
                                        {(captain?.upiId && String(captain.upiId).trim()) || UPI_PAYEE || 'Ask your driver'}
                                    </span>
                                </p>
                                {captain?.paymentQrUrl ? (
                                    <p className="text-[11px] break-all text-slate-500">
                                        Driver QR:{' '}
                                        <a href={captain.paymentQrUrl} className="text-emerald-400 underline" target="_blank" rel="noreferrer">
                                            Open payment QR
                                        </a>
                                    </p>
                                ) : null}
                            </div>
                        )}
                        <button
                            type="button"
                            disabled={paying}
                            onClick={() => onPay(selectedPaymentMethod)}
                            className="mt-4 w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                        >
                            {paying ? (
                                <span className="inline-flex items-center justify-center gap-2">
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                    Processing…
                                </span>
                            ) : (
                                `Pay ${formatINR(ride?.price)}`
                            )}
                        </button>
                    </section>
                )}

                {/* Rating */}
                {paid && canRate && (
                    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                        <h2 className="text-sm font-semibold text-white">Rate your driver</h2>
                        <p className="mt-1 text-xs text-slate-500">Your feedback helps everyone ride better.</p>
                        {rateError ? (
                            <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{rateError}</p>
                        ) : null}
                        <div className="mt-4 flex justify-center gap-2">
                            {[ 1, 2, 3, 4, 5 ].map((v) => (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => setRatingDraft(v)}
                                    className={`text-3xl leading-none transition ${
                                        ratingDraft >= v ? 'text-amber-400 drop-shadow' : 'text-slate-600'
                                    }`}
                                    aria-label={`${v} stars`}
                                >
                                    ★
                                </button>
                            ))}
                        </div>
                        <textarea
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="Optional feedback"
                            rows={3}
                            className="mt-4 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                        />
                        <div className="mt-4 flex gap-2">
                            <button
                                type="button"
                                disabled={submittingRating || ratingDraft < 1}
                                onClick={handleRateSubmit}
                                className="flex-1 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white disabled:opacity-40"
                            >
                                {submittingRating ? 'Submitting…' : 'Submit rating'}
                            </button>
                            <button
                                type="button"
                                disabled={submittingRating}
                                onClick={() => setSkippedRating(true)}
                                className="rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-slate-200 ring-1 ring-white/10"
                            >
                                Skip
                            </button>
                        </div>
                    </section>
                )}

                {paid && ride?.rating ? (
                    <p className="text-center text-sm text-emerald-400/90">You rated this trip {ride.rating}★ — thank you!</p>
                ) : null}

                {/* Receipt */}
                {paid && (
                    <section className="rounded-2xl border border-white/10 bg-black/40 p-4">
                        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Receipt</h2>
                        <p className="mt-2 text-sm text-slate-400">{formatWhen(ride?.completedAt)}</p>
                        <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
                            <div className="flex justify-between text-slate-400">
                                <span>Trip fare</span>
                                <span className="text-white">{formatINR(ride?.price)}</span>
                            </div>
                            {Number(ride?.discountAmount) > 0 ? (
                                <div className="flex justify-between text-emerald-400/90">
                                    <span>Discount</span>
                                    <span>−{formatINR(ride.discountAmount)}</span>
                                </div>
                            ) : null}
                            {ride?.platformFee != null && ride.paymentStatus === 'success' ? (
                                <div className="flex justify-between text-slate-500">
                                    <span>Service fee</span>
                                    <span>{formatINR(ride.platformFee)}</span>
                                </div>
                            ) : null}
                            <div className="flex justify-between border-t border-white/10 pt-3 text-base font-semibold text-white">
                                <span>Total paid</span>
                                <span>{formatINR(ride?.chargedAmount ?? ride?.price)}</span>
                            </div>
                            <div className="flex justify-between text-xs text-slate-500">
                                <span>Method</span>
                                <span>{paymentMethodLabel(ride?.paymentMethod)}</span>
                            </div>
                        </div>

                        {captain ? (
                            <div className="mt-5 flex items-center gap-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/20 text-base font-semibold text-emerald-300">
                                    {initial}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium text-white">{captain.name || 'Driver'}</p>
                                    <p className="text-xs text-slate-400">
                                        {[ captain.vehicleType, captain.vehicleNumber ].filter(Boolean).join(' · ')}
                                    </p>
                                    {captain.phone ? (
                                        <p className="text-xs text-slate-500">{captain.phone}</p>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}
                    </section>
                )}

                {/* Footer actions */}
                {paid && doneWithRating && (
                    <div className="space-y-2 pb-6">
                        <p className="text-center text-xs text-slate-500">
                            {secLeft > 0 ? `Returning home in ${secLeft}s…` : 'Leaving…'}
                        </p>
                        <button
                            type="button"
                            onClick={onHome}
                            className="w-full rounded-xl bg-white py-3.5 text-sm font-semibold text-slate-900 shadow-lg"
                        >
                            Book another ride
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
