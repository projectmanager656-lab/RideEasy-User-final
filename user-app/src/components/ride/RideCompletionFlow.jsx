import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

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
    const navigate = useNavigate()

    const paid = ride?.paymentStatus === 'success'
    const canRate = paid && ride?.rating == null && !skippedRating
    const doneWithRating = Boolean(ride?.rating || skippedRating)
    const invoiceUrl = ride?._id ? `/invoice/${ride._id}` : null

    /** 25% advance split — at completion we only collect the remaining 75%. */
    const totalFare = Number(ride?.price || 0)
    const advancePaid = ride?.advancePaymentStatus === 'success' ? Number(ride?.advanceAmount || 0) : 0
    const remainingDue = Number(ride?.chargedAmount) > 0
        ? Number(ride.chargedAmount)
        : Math.max(0, totalFare - advancePaid)

    /** Open the invoice for this exact ride; keep the user in the app. */
    const openInvoice = () => {
        if (!invoiceUrl) return
        navigate(invoiceUrl, { state: { from: 'completion' } })
    }
    /** Download/print — the invoice page is print-optimized. */
    const downloadInvoice = () => {
        if (!invoiceUrl) return
        navigate(invoiceUrl, { state: { from: 'completion' } })
    }

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
        <div className="flex min-h-dvh flex-col bg-theme-bg text-theme-primary">
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-theme bg-theme-bg/90 px-4 py-3 backdrop-blur">
                <Link
                    to="/home"
                    replace
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-theme-card text-theme-primary ring-1 ring-theme"
                    aria-label="Home"
                >
                    <i className="ri-home-5-line text-lg" />
                </Link>
                <span className="text-sm font-medium text-brand-yellow">Trip complete</span>
                <span className="w-10" />
            </header>

            <div className="scrollbar-hide flex-1 space-y-6 overflow-y-auto px-4 pb-28 pt-6">
                {/* Hero */}
                <section className="rounded-2xl border border-brand-yellow/30 bg-brand-yellow/10 p-5 ring-1 ring-brand-yellow/20">
                    <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-yellow/20 text-2xl text-brand-yellow">
                            <i className="ri-checkbox-circle-fill" />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold text-theme-primary">Ride completed</h1>
                            <p className="mt-1 text-sm text-theme-secondary">Thanks for riding with RideEasy</p>
                        </div>
                    </div>
                </section>

                {/* Route */}
                <section className="rounded-2xl border border-theme bg-theme-card p-4">
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-theme-muted">Trip</h2>
                    <div className="space-y-4">
                        <div className="flex gap-3">
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
                                <i className="ri-map-pin-2-fill text-sm" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-xs text-theme-muted">Pickup</p>
                                <p className="text-sm font-medium text-theme-primary">{ride?.pickupLocation || '—'}</p>
                            </div>
                        </div>
                        <div className="ml-4 border-l border-dashed border-theme pl-5" />
                        <div className="flex gap-3">
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-theme-card-muted text-theme-secondary">
                                <i className="ri-flag-fill text-sm" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-xs text-theme-muted">Drop</p>
                                <p className="text-sm font-medium text-theme-primary">{ride?.dropLocation || '—'}</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-3 border-t border-theme pt-4">
                        <div className="rounded-xl bg-theme-card-muted px-2 py-3 text-center">
                            <p className="text-[10px] uppercase text-theme-muted">Distance</p>
                            <p className="mt-1 text-sm font-semibold text-theme-primary">
                                {distanceKm != null ? `${distanceKm.toFixed(1)} km` : '—'}
                            </p>
                        </div>
                        <div className="rounded-xl bg-theme-card-muted px-2 py-3 text-center">
                            <p className="text-[10px] uppercase text-theme-muted">Duration</p>
                            <p className="mt-1 text-sm font-semibold text-theme-primary">{formatDuration(ride?.duration)}</p>
                        </div>
                        <div className="rounded-xl bg-theme-card-muted px-2 py-3 text-center">
                            <p className="text-[10px] uppercase text-theme-muted">Fare</p>
                            <p className="mt-1 text-sm font-semibold text-brand-yellow">{formatINR(ride?.price)}</p>
                        </div>
                    </div>
                    <p className="mt-3 text-center text-xs text-theme-muted">
                        Payment: <span className="font-medium text-theme-secondary">{paymentMethodLabel(ride?.paymentMethod)}</span>
                        {paid ? (
                            <span className="ml-2 rounded-full bg-brand-yellow/15 px-2 py-0.5 text-brand-yellow">Paid</span>
                        ) : (
                            <span className="ml-2 rounded-full bg-brand-yellow/15 px-2 py-0.5 text-brand-yellow">Pending</span>
                        )}
                    </p>
                </section>

                {/* Payment */}
                {!paid && (
                    <section className="rounded-2xl border border-brand-yellow/30 bg-brand-yellow/10 p-4">
                        <h2 className="mb-2 text-sm font-semibold text-brand-yellow">Complete payment</h2>
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
                                            ? 'bg-brand-yellow text-brand-dark'
                                            : 'bg-theme-card-muted text-theme-secondary ring-1 ring-theme hover:bg-theme-card'
                                    }`}
                                >
                                    {m === 'Online' ? 'Online' : m}
                                </button>
                            ))}
                        </div>
                        {(selectedPaymentMethod === 'UPI' || selectedPaymentMethod === 'Online') && (
                            <div className="mt-3 space-y-1 text-xs text-theme-secondary">
                                <p>
                                    Pay driver directly — UPI:{' '}
                                    <span className="font-semibold text-theme-primary">
                                        {(captain?.upiId && String(captain.upiId).trim()) || UPI_PAYEE || 'Ask your driver'}
                                    </span>
                                </p>
                                {captain?.paymentQrUrl ? (
                                        <p className="text-[11px] break-all text-theme-muted">
                                        Driver QR:{' '}
                                            <a href={captain.paymentQrUrl} className="text-brand-yellow underline" target="_blank" rel="noreferrer">
                                            Open payment QR
                                        </a>
                                    </p>
                                ) : null}
                            </div>
                        )}
                        {advancePaid > 0 && (
                            <p className="mt-3 rounded-lg border border-theme bg-theme-card-muted px-3 py-2 text-xs text-theme-secondary">
                                Fare {formatINR(totalFare)} · Advance paid {formatINR(advancePaid)} ·{' '}
                                <span className="font-semibold text-theme-primary">Remaining {formatINR(remainingDue)}</span>
                            </p>
                        )}
                        <button
                            type="button"
                            disabled={paying}
                            onClick={() => onPay(selectedPaymentMethod)}
                            className="mt-4 w-full rounded-xl bg-brand-yellow py-3.5 text-sm font-semibold text-brand-dark shadow-lg shadow-brand-yellow/20 disabled:opacity-50"
                        >
                            {paying ? (
                                <span className="inline-flex items-center justify-center gap-2">
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                    Processing…
                                </span>
                            ) : (
                                `Pay ${formatINR(remainingDue)}`
                            )}
                        </button>
                    </section>
                )}

                {/* Rating */}
                {paid && canRate && (
                    <section className="rounded-2xl border border-theme bg-theme-card p-4">
                        <h2 className="text-sm font-semibold text-theme-primary">Rate your driver</h2>
                        <p className="mt-1 text-xs text-theme-muted">Your feedback helps everyone ride better.</p>
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
                                        ratingDraft >= v ? 'text-brand-yellow drop-shadow' : 'text-theme-muted'
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
                            className="mt-4 w-full rounded-xl border border-theme bg-theme-input px-3 py-2 text-sm text-theme-primary placeholder:text-theme-muted focus:border-brand-yellow/50 focus:outline-none focus:ring-1 focus:ring-brand-yellow/40"
                        />
                        <div className="mt-4 flex gap-2">
                            <button
                                type="button"
                                disabled={submittingRating || ratingDraft < 1}
                                onClick={handleRateSubmit}
                                className="flex-1 rounded-xl bg-brand-yellow py-3 text-sm font-semibold text-brand-dark disabled:opacity-40"
                            >
                                {submittingRating ? 'Submitting…' : 'Submit rating'}
                            </button>
                            <button
                                type="button"
                                disabled={submittingRating}
                                onClick={() => setSkippedRating(true)}
                                className="rounded-xl bg-theme-card-muted px-4 py-3 text-sm font-medium text-theme-secondary ring-1 ring-theme"
                            >
                                Skip
                            </button>
                        </div>
                    </section>
                )}

                {paid && ride?.rating ? (
                    <p className="text-center text-sm text-brand-yellow">You rated this trip {ride.rating}★ — thank you!</p>
                ) : null}

                {/* Receipt */}
                {paid && (
                    <section className="rounded-2xl border border-theme bg-theme-card p-4">
                        <h2 className="text-xs font-semibold uppercase tracking-wide text-theme-muted">Receipt</h2>
                        <p className="mt-2 text-sm text-theme-secondary">{formatWhen(ride?.completedAt)}</p>
                        <div className="mt-4 space-y-2 border-t border-theme pt-4 text-sm">
                            <div className="flex justify-between text-theme-secondary">
                                <span>Trip fare</span>
                                <span className="text-theme-primary">{formatINR(ride?.price)}</span>
                            </div>
                            {advancePaid > 0 ? (
                                <div className="flex justify-between text-brand-yellow">
                                    <span>25% advance paid</span>
                                    <span>{formatINR(advancePaid)}</span>
                                </div>
                            ) : null}
                            {Number(ride?.discountAmount) > 0 ? (
                                <div className="flex justify-between text-brand-yellow">
                                    <span>Discount</span>
                                    <span>−{formatINR(ride.discountAmount)}</span>
                                </div>
                            ) : null}
                            {ride?.platformFee != null && ride.paymentStatus === 'success' ? (
                                <div className="flex justify-between text-theme-muted">
                                    <span>Service fee</span>
                                    <span>{formatINR(ride.platformFee)}</span>
                                </div>
                            ) : null}
                            <div className="flex justify-between border-t border-theme pt-3 text-base font-semibold text-theme-primary">
                                <span>Total paid</span>
                                <span>{formatINR(advancePaid + Number(ride?.chargedAmount ?? 0))}</span>
                            </div>
                            <div className="flex justify-between text-xs text-theme-muted">
                                <span>Method</span>
                                <span>{paymentMethodLabel(ride?.paymentMethod)}</span>
                            </div>
                        </div>

                        {captain ? (
                            <div className="mt-5 flex items-center gap-3 rounded-xl bg-theme-card-muted p-3 ring-1 ring-theme">
                                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-yellow/15 text-base font-semibold text-brand-yellow">
                                    {initial}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium text-theme-primary">{captain.name || 'Driver'}</p>
                                    <p className="text-xs text-theme-secondary">
                                        {[ captain.vehicleType, captain.vehicleNumber ].filter(Boolean).join(' · ')}
                                    </p>
                                    {captain.phone ? (
                                        <p className="text-xs text-theme-muted">{captain.phone}</p>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}

                        {/* Invoice actions — always available once the ride is completed */}
                        {invoiceUrl ? (
                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={openInvoice}
                                    className="flex items-center justify-center gap-2 rounded-xl bg-theme-card-muted py-3 text-sm font-semibold text-theme-primary ring-1 ring-theme"
                                >
                                    <i className="ri-file-list-3-line text-base" aria-hidden />
                                    View Invoice
                                </button>
                                <button
                                    type="button"
                                    onClick={downloadInvoice}
                                    className="flex items-center justify-center gap-2 rounded-xl bg-brand-yellow py-3 text-sm font-semibold text-brand-dark"
                                >
                                    <i className="ri-download-2-line text-base" aria-hidden />
                                    Download Invoice
                                </button>
                            </div>
                        ) : null}
                    </section>
                )}

                {/* Footer actions */}
                {paid && doneWithRating && (
                    <div className="space-y-2 pb-6">
                        <p className="text-center text-xs text-theme-muted">
                            {secLeft > 0 ? `Returning home in ${secLeft}s…` : 'Leaving…'}
                        </p>
                        <button
                            type="button"
                            onClick={onHome}
                            className="w-full rounded-xl bg-brand-yellow py-3.5 text-sm font-semibold text-brand-dark shadow-lg"
                        >
                            Book another ride
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
