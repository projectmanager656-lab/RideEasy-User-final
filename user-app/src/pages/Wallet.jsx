import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, withAuth } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { stripApiEnvelope } from '../utils/apiBody'

function money (value) {
    const n = Number(value)
    return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'
}

function dateLabel (value) {
    if (!value) return '—'
    return new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const Wallet = () => {
    const navigate = useNavigate()
    const [wallet, setWallet] = useState(null)
    const [coupons, setCoupons] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        let cancelled = false
        Promise.all([
            apiClient.get('/users/wallet', withAuth()),
            apiClient.get('/users/coupons', withAuth()),
        ]).then(([walletRes, couponsRes]) => {
            if (cancelled) return
            const walletBody = stripApiEnvelope(walletRes.data)
            const couponBody = stripApiEnvelope(couponsRes.data)
            setWallet(walletBody?.wallet || { balance: 0, transactions: [] })
            setCoupons(Array.isArray(couponBody?.coupons) ? couponBody.coupons : [])
        }).catch((err) => {
            if (!cancelled) setError(formatApiError(err))
        }).finally(() => {
            if (!cancelled) setLoading(false)
        })
        return () => { cancelled = true }
    }, [])

    return (
        <div className="min-h-full bg-theme-bg px-4 pb-24 text-theme-primary">
            <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-theme bg-theme-bg/95 px-4 py-3 backdrop-blur">
                <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full border border-theme bg-theme-card text-theme-secondary">
                    <i className="ri-arrow-left-line text-lg" />
                </button>
                <div>
                    <h1 className="text-lg font-bold">Wallet & Offers</h1>
                    <p className="text-xs text-theme-muted">Your balance, transactions, and eligible coupons</p>
                </div>
            </header>

            {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
            {loading ? <p className="py-10 text-center text-sm text-theme-muted">Loading wallet…</p> : (
                <div className="space-y-5 pt-5">
                    <section className="rounded-2xl border border-brand-yellow/30 bg-theme-card p-5">
                        <p className="text-xs uppercase tracking-wider text-theme-muted">Wallet balance</p>
                        <p className="mt-2 text-4xl font-black text-brand-yellow">{money(wallet?.balance)}</p>
                        <p className="mt-2 text-xs text-theme-muted">Wallet payments are recorded against the ride and settled by RideEasy.</p>
                    </section>

                    <section>
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="text-base font-bold">Coupons & Offers</h2>
                            <i className="ri-coupon-3-line text-xl text-brand-yellow" aria-hidden />
                        </div>
                        {coupons.length === 0 ? <p className="rounded-xl border border-dashed border-theme px-4 py-5 text-sm text-theme-muted">No eligible offers available right now.</p> : (
                            <div className="space-y-2">
                                {coupons.map((coupon) => (
                                    <div key={coupon._id} className="rounded-xl border border-theme bg-theme-card p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-semibold text-theme-primary">{coupon.title}</p>
                                                <p className="mt-1 text-xs text-theme-secondary">{coupon.description || `${coupon.discountType === 'percentage' ? `${coupon.discountValue}% off` : `${money(coupon.discountValue)} off`}`}</p>
                                            </div>
                                            <span className="rounded-lg border border-brand-yellow/50 px-2 py-1 text-xs font-bold text-brand-yellow">{coupon.code}</span>
                                        </div>
                                        <p className="mt-3 text-xs text-theme-muted">Valid until {coupon.expiresAt ? dateLabel(coupon.expiresAt) : 'further notice'} · {coupon.eligibility}</p>
                                        {coupon.used && <p className="mt-2 text-xs font-semibold text-emerald-400">Used</p>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section>
                        <h2 className="mb-3 text-base font-bold">Transaction history</h2>
                        {wallet?.transactions?.length ? <div className="divide-y divide-theme overflow-hidden rounded-xl border border-theme bg-theme-card">
                            {wallet.transactions.map((transaction) => (
                                <div key={transaction._id} className="flex items-center justify-between gap-3 px-4 py-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{transaction.description || 'Wallet transaction'}</p>
                                        <p className="mt-1 text-xs text-theme-muted">{dateLabel(transaction.createdAt)}{transaction.rideId ? ` · Ride ${String(transaction.rideId).slice(-6)}` : ''}</p>
                                    </div>
                                    <span className={`shrink-0 text-sm font-bold ${transaction.direction === 'credit' ? 'text-emerald-400' : 'text-amber-300'}`}>{transaction.direction === 'credit' ? '+' : '-'}{money(transaction.amount)}</span>
                                </div>
                            ))}
                        </div> : <p className="rounded-xl border border-dashed border-theme px-4 py-5 text-sm text-theme-muted">No wallet transactions yet.</p>}
                    </section>
                </div>
            )}
        </div>
    )
}

export default Wallet
