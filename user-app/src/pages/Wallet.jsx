import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, withAuth } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { stripApiEnvelope } from '../utils/apiBody'
import { loadRazorpayCheckout } from '../utils/loadRazorpay'

function money (value) {
    const n = Number(value)
    return Number.isFinite(n)
        ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
        : '—'
}

function dateLabel (value) {
    if (!value) return '—'
    return new Date(value).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

/**
 * Razorpay Checkout `display` config scoped to the selected wallet method.
 * Google Pay / PhonePe route through the gateway UPI flow (the rider picks their
 * installed UPI app) — we never force a specific app or fake success. Bank uses
 * netbanking. Razorpay exposes every supported method.
 */
function razorpayDisplayFor (method) {
    const upi = { name: 'UPI', instruments: [ { method: 'upi' } ] }
    const cards = { name: 'Cards', instruments: [ { method: 'card' } ] }
    const netbanking = { name: 'Net Banking', instruments: [ { method: 'netbanking' } ] }
    if (method === 'GPay' || method === 'PhonePe') {
        return { blocks: { upi }, sequence: [ 'block.upi' ], preferences: { show_default_blocks: false } }
    }
    if (method === 'Bank') {
        return { blocks: { netbanking }, sequence: [ 'block.netbanking' ], preferences: { show_default_blocks: false } }
    }
    return {
        blocks: { upi, cards, netbanking },
        sequence: [ 'block.upi', 'block.cards', 'block.netbanking' ],
        preferences: { show_default_blocks: false },
    }
}

const Wallet = () => {
    const navigate = useNavigate()

    const [wallet, setWallet] = useState(null)
    const [coupons, setCoupons] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const [topupAmount, setTopupAmount] = useState('')
    const [topupLoading, setTopupLoading] = useState(false)
    const [topupMessage, setTopupMessage] = useState('')
    const [topupError, setTopupError] = useState('')
    const [paymentMethod, setPaymentMethod] = useState('')

    /** Blocks double-submit (button + Enter) and duplicate gateway callbacks. */
    const topupInFlightRef = useRef(false)
    const paymentSettledRef = useRef(false)

    useEffect(() => {
        let cancelled = false

        Promise.all([
            apiClient.get('/users/wallet', withAuth()),
            apiClient.get('/users/coupons', withAuth()),
        ])
            .then(([walletRes, couponsRes]) => {
                if (cancelled) return

                const walletBody = stripApiEnvelope(walletRes.data)
                const couponBody = stripApiEnvelope(couponsRes.data)

                setWallet(
                    walletBody?.wallet || {
                        balance: 0,
                        transactions: []
                    }
                )

                setCoupons(
                    Array.isArray(couponBody?.coupons)
                        ? couponBody.coupons
                        : []
                )
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(formatApiError(err))
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false)
                }
            })

        return () => {
            cancelled = true
        }
    }, [])

    const handleWalletTopup = async () => {
        if (topupInFlightRef.current) return

        const amount = Number(topupAmount)

        setTopupMessage('')
        setTopupError('')

        if (!Number.isFinite(amount) || amount <= 0) {
            setTopupError('Enter a valid amount greater than ₹0')
            return
        }

        if (amount > 1000000) {
            setTopupError('Maximum wallet top-up is ₹10,00,000')
            return
        }

        if (!paymentMethod) {
            setTopupError('Please select a payment method')
            return
        }

        if (paymentMethod === 'razorpay' && !window.Razorpay) {
            /**
             * Razorpay Checkout is loaded on demand (utils/loadRazorpay) instead of a
             * global <script> in index.html, so it no longer initialises on every screen
             * at launch and fire its broken `.../build/undefined` request (403).
             */
            try {
                await loadRazorpayCheckout()
            } catch {
                setTopupError('Payment gateway is not loaded. Please check your connection and try again.')
                return
            }
        }

        if (!window.Razorpay) {
            setTopupError('Payment gateway is not loaded. Please check your connection and try again.')
            return
        }

        topupInFlightRef.current = true
        paymentSettledRef.current = false

        try {
            setTopupLoading(true)

            // Step 1: Create a Razorpay order on the backend.
            const orderResponse = await apiClient.post(
                '/users/wallet/create-razorpay-order',
                { amount },
                withAuth()
            )

            const orderBody = stripApiEnvelope(orderResponse.data)

            const orderId = orderBody?.orderId
            const razorpayAmount = orderBody?.amount
            const currency = orderBody?.currency || 'INR'
            const keyId = orderBody?.keyId

            if (!orderId || !keyId || !razorpayAmount) {
                throw new Error('Invalid Razorpay order response')
            }

            // Step 2: Open Razorpay Checkout.
            const options = {
                key: keyId,
                amount: razorpayAmount,
                currency,
                name: 'RideEasy',
                description: 'RideEasy Wallet Recharge',
                order_id: orderId,

                method: {
                    upi: true,
                    card: true,
                    netbanking: true,
                    wallet: true
                },

                /** Scope the checkout to the selected method (see razorpayDisplayFor). */
                config: {
                    display: razorpayDisplayFor(paymentMethod)
                },

                prefill: {
                    name: '',
                    email: '',
                    contact: ''
                },

                notes: {
                    paymentType: 'wallet_topup',
                    paymentMethod
                },

                theme: {
                    color: '#FFD000'
                },

                handler: async function (paymentResponse) {
                    if (paymentSettledRef.current) return
                    paymentSettledRef.current = true
                    try {
                        setTopupMessage('Verifying your payment...')
                        setTopupError('')

                        // Step 3: Verify payment on backend.
                        const verifyResponse = await apiClient.post(
                            '/users/wallet/verify-razorpay-payment',
                            {
                                razorpayOrderId: paymentResponse.razorpay_order_id,
                                razorpayPaymentId: paymentResponse.razorpay_payment_id,
                                razorpaySignature: paymentResponse.razorpay_signature,
                                amount
                            },
                            withAuth()
                        )

                        const verifyBody = stripApiEnvelope(verifyResponse.data)

                        const newBalance = Number(
                            verifyBody?.walletBalance ??
                            verifyBody?.wallet?.balance
                        )

                        // Step 4: Refresh wallet from backend.
                        const refreshed = await apiClient.get(
                            '/users/wallet',
                            withAuth()
                        )

                        const refreshedBody = stripApiEnvelope(refreshed.data)

                        setWallet(
                            refreshedBody?.wallet || {
                                ...(wallet || {}),
                                balance: Number.isFinite(newBalance)
                                    ? newBalance
                                    : wallet?.balance || 0,
                                transactions: wallet?.transactions || []
                            }
                        )

                        setTopupAmount('')
                        setPaymentMethod('')

                        setTopupMessage(
                            `₹${amount.toLocaleString('en-IN')} added to your wallet successfully.`
                        )
                    } catch (err) {
                        const message =
                            err?.response?.data?.message ||
                            err?.response?.data?.error ||
                            err?.message ||
                            'Payment verification failed'

                        setTopupError(message)
                        setTopupMessage('')
                    } finally {
                        topupInFlightRef.current = false
                        setTopupLoading(false)
                    }
                },

                modal: {
                    ondismiss: function () {
                        // Checkout closed without a verified payment → allow retry.
                        topupInFlightRef.current = false
                        setTopupLoading(false)
                    }
                }
            }

            const razorpay = new window.Razorpay(options)

            razorpay.on('payment.failed', function (response) {
                topupInFlightRef.current = false
                setTopupLoading(false)
                setTopupMessage('')

                const description = response?.error?.description || ''
                const bankUnavailable = paymentMethod === 'Bank'
                    && /netbank|bank|not\s*enabled|unavailable|unsupported|invalid/i.test(description)

                setTopupError(
                    bankUnavailable
                        ? 'Bank payment is currently unavailable. Please choose another payment method.'
                        : (description || 'Payment failed. Please try again.')
                )
            })

            razorpay.open()
        } catch (err) {
            const message =
                err?.response?.data?.message ||
                err?.response?.data?.error ||
                err?.message ||
                'Unable to start wallet payment'

            setTopupError(message)
            topupInFlightRef.current = false
            setTopupLoading(false)
        }
    }

    return (
        <div className="flex h-full flex-col overflow-hidden bg-theme-bg px-4 text-theme-primary">
            <header className="z-10 -mx-4 flex shrink-0 items-center gap-3 border-b border-theme bg-theme-bg/95 px-4 py-3 backdrop-blur">
                <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full border border-theme bg-theme-card text-theme-secondary">
                    <i className="ri-arrow-left-line text-lg" />
                </button>
                <div>
                    <h1 className="text-lg font-bold">Wallet & Offers</h1>
                    <p className="text-[9px] sm:text-[10px] text-theme-muted">Your balance, transactions, and eligible coupons</p>
                </div>
            </header>

            {/* Only this area scrolls — the header stays fixed. */}
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-hide touch-pan-y [-webkit-overflow-scrolling:touch] pb-24">
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
                        
                <div className="mt-5 rounded-xl border border-theme bg-theme-card p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-base font-semibold">Add Money</h2>
                            <p className="mt-1 text-xs text-theme-muted">
                                Add balance to your RideEasy wallet
                            </p>
                        </div>
                        <i className="ri-add-circle-line text-xl text-brand-yellow" />
                    </div>

                    <div className="mt-4 flex gap-2">
                        <div className="flex-1">
                            <div className="flex items-center rounded-xl border border-theme bg-theme-input px-3">
                                <span className="text-sm text-theme-muted">₹</span>
                                <input
                                    type="number"
                                    min="1"
                                    max="1000000"
                                    step="1"
                                    value={topupAmount}
                                    onChange={(e) => {
                                        setTopupAmount(e.target.value)
                                        setTopupMessage('')
                                        setTopupError('')
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleWalletTopup()
                                        }
                                    }}
                                    placeholder="Enter amount"
                                    className="w-full bg-transparent px-2 py-3 text-sm outline-none"
                                />
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleWalletTopup}
                            disabled={topupLoading}
                            className="rounded-xl bg-brand-yellow px-4 py-3 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {topupLoading ? 'Adding...' : 'Add Money'}
                        </button>
                    </div>

                    <div className="mt-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-theme-muted">
                            Choose payment method
                        </p>

                        <div className="grid grid-cols-4 gap-1.5">
                            <button
                                type="button"
                                onClick={() => {
                                    setPaymentMethod('GPay')
                                    setTopupError('')
                                    setTopupMessage('')
                                }}
                                className={`flex flex-col items-center justify-center rounded-xl border p-3 transition ${
                                    paymentMethod === 'GPay'
                                        ? 'border-brand-yellow bg-brand-yellow/10'
                                        : 'border-theme bg-theme-card'
                                }`}
                            >
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg font-black text-[#4285F4] shadow-sm">
                                    G
                                </div>
                                <span className="mt-2 text-xs font-semibold">
                                    Google Pay
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setPaymentMethod('PhonePe')
                                    setTopupError('')
                                    setTopupMessage('')
                                }}
                                className={`flex flex-col items-center justify-center rounded-xl border p-3 transition ${
                                    paymentMethod === 'PhonePe'
                                        ? 'border-brand-yellow bg-brand-yellow/10'
                                        : 'border-theme bg-theme-card'
                                }`}
                            >
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5f259f] text-xl font-black text-white shadow-sm">
                                    P
                                </div>
                                <span className="mt-2 text-xs font-semibold">
                                    PhonePe
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setPaymentMethod('Bank')
                                    setTopupError('')
                                    setTopupMessage('')
                                }}
                                className={`flex flex-col items-center justify-center rounded-xl border p-3 transition ${
                                    paymentMethod === 'Bank'
                                        ? 'border-brand-yellow bg-brand-yellow/10'
                                        : 'border-theme bg-theme-card'
                                }`}
                            >
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-theme-card text-xl">
                                    <i className="ri-bank-line" />
                                </div>
                                <span className="mt-2 text-xs font-semibold">
                                    Bank Account
                                </span>
                            </button>
                          <button
                              type="button"
                              onClick={() => setPaymentMethod('razorpay')}
                              aria-label="Pay with Razorpay"
                              className={`flex min-h-[180px] flex-1 flex-col items-center justify-center rounded-2xl border px-4 py-5 transition-all duration-200 ${
                                  paymentMethod === 'razorpay'
                                      ? 'border-brand-yellow bg-brand-yellow/10 ring-2 ring-brand-yellow'
                                      : 'border-theme bg-theme-card hover:border-brand-yellow/60'
                              }`}
                          >
                              <div className="mb-4 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-white shadow-lg">
                                  <span className="text-lg font-black italic tracking-tight text-[#3395FF]">
                                      R
                                  </span>
                              </div>

                              <span className="text-[10px] sm:text-xs font-bold text-theme-primary">
                                  Razorpay
                              </span>

                              <span className="mt-1 text-xs text-theme-muted">
                                  UPI • Cards • Netbanking
                              </span>
                          </button>

                        </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                        {[100, 200, 500, 1000].map((amount) => (
                            <button
                                key={amount}
                                type="button"
                                onClick={() => {
                                    setTopupAmount(String(amount))
                                    setTopupMessage('')
                                    setTopupError('')
                                }}
                                className="rounded-lg border border-theme px-3 py-1.5 text-xs font-medium"
                            >
                                ₹{amount}
                            </button>
                        ))}
                    </div>

                    {topupMessage && (
                        <p className="mt-3 text-sm text-emerald-500">
                            {topupMessage}
                        </p>
                    )}

                    {topupError && (
                        <p className="mt-3 text-sm text-red-500">
                            {topupError}
                        </p>
                    )}
                </div>

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
        </div>
    )
}

export default Wallet
