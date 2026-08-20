import React, { useContext, useEffect, useState, useCallback } from 'react'
import { CaptainDataContext } from '../context/CaptainContext'
import { stripApiEnvelope } from '../utils/apiBody'
import { getMySubscriptionStatus, getSubscriptionPlans, getCaptainEarnings, getCaptainRideHistory, updateCaptainStatus, createSubscription } from '../services/captainService'

function normalizeLocationText(value, fallback = '—') {
    if (typeof value === 'string') return value
    if (value && typeof value === 'object') {
        if (typeof value.name === 'string') return value.name
        if (typeof value.address === 'string') return value.address
        if (Array.isArray(value.coordinates) && value.coordinates.length >= 2) return `${value.coordinates[1]}, ${value.coordinates[0]}`
    }
    return fallback
}

function formatDateTime(value) {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleString()
}

function formatRemaining (ms) {
    if (ms <= 0) return '0m'
    const s = Math.floor(ms / 1000)
    const d = Math.floor(s / 86400)
    const h = Math.floor((s % 86400) / 3600)
    const m = Math.floor((s % 3600) / 60)
    if (d > 0) return `${d}d ${h}h`
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
}

const CaptainDetails = () => {
    const { captain, setCaptain } = useContext(CaptainDataContext)
    const [earnings, setEarnings] = useState(null)
    const [subscription, setSubscription] = useState(null)
    const [plans, setPlans] = useState(null)
    const [plansError, setPlansError] = useState(false)
    const [subscribing, setSubscribing] = useState(false)
    const [selectedPlan, setSelectedPlan] = useState('weekly')
    const [isOnline, setIsOnline] = useState(captain?.status === 'active')
    const [togglingStatus, setTogglingStatus] = useState(false)
    const [now, setNow] = useState(() => Date.now())
    const [rideHistory, setRideHistory] = useState([])

    const refreshSubscription = useCallback(() => {
        getMySubscriptionStatus()
            .then((data) => setSubscription(data))
            .catch(() => setSubscription({ active: false }))
    }, [])

    useEffect(() => {
        setIsOnline(captain?.status === 'active')
    }, [captain?.status])

    useEffect(() => {
        // Immediate subscription fallback from login/profile payload
        if (!captain) return
        if (captain.subscriptionStatus || captain.subscriptionPlan || captain.subscriptionExpiresAt) {
            const exp = captain.subscriptionExpiresAt || null
            const active = captain.subscriptionStatus === 'active' && (!exp || new Date(exp) > new Date())
            setSubscription((prev) => prev || {
                active,
                subscription: {
                    status: captain.subscriptionStatus || 'none',
                    plan: captain.subscriptionPlan || null,
                    expiresAt: exp,
                    startedAt: captain.subscriptionStartedAt || null,
                },
            })
        }
    }, [captain])

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(id)
    }, [])

    useEffect(() => {
        if (!captain?._id) return
        getCaptainEarnings()
            .then((data) => setEarnings(stripApiEnvelope(data)))
            .catch(() => setEarnings({ totalEarnings: 0, count: 0, todayEarnings: 0, todayRides: 0 }))
        refreshSubscription()
        getSubscriptionPlans()
            .then((data) => {
                setPlans(data?.plans || null)
                setPlansError(false)
            })
            .catch(() => {
                setPlans(null)
                setPlansError(true)
            })
        getCaptainRideHistory()
            .then((data) => setRideHistory(stripApiEnvelope(data)?.rides || []))
            .catch(() => setRideHistory([]))
    }, [captain?._id, refreshSubscription])

    const handleToggleOnline = () => {
        const next = isOnline ? 'inactive' : 'active'
        setTogglingStatus(true)
        updateCaptainStatus(next)
            .then((data) => {
                const st = data?.status
                setIsOnline(st === 'active')
                if (setCaptain) setCaptain((prev) => ({ ...(prev || {}), status: st }))
            })
            .catch((e) => alert(e.response?.data?.message || 'Could not update status'))
            .finally(() => setTogglingStatus(false))
    }

    const displayName = captain?.name || (captain?.fullname ? `${captain.fullname.firstname || ''} ${captain.fullname.lastname || ''}`.trim() : '') || 'Driver'
    const vt = captain?.vehicleType === 'BIKE' ? 'BIKE' : captain?.vehicleType === 'AUTO' ? 'AUTO' : 'CAR'
    const planPrices = plans?.[vt]
    const price = planPrices?.[selectedPlan]

    const handleSubscribe = () => {
        if (!price) return
        setSubscribing(true)
        createSubscription({
            driverId: captain._id,
            plan: selectedPlan,
            paymentMode: 'Cash'
        })
            .then(() => {
                refreshSubscription()
            })
            .catch((e) => alert(e.response?.data?.message || 'Subscribe failed'))
            .finally(() => setSubscribing(false))
    }

    const subExpiresAt = subscription?.subscription?.expiresAt
    const subExpiresMs = subExpiresAt ? Math.max(0, new Date(subExpiresAt).getTime() - now) : (subscription?.subscription?.expiresInMs ?? 0)

    const canGoOnline = captain?.approved !== false && subscription?.active

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-semibold">
                        {displayName.charAt(0)}
                    </div>
                    <div>
                        <h4 className="font-medium">{displayName}</h4>
                        <p className="text-sm text-slate-500">{captain?.vehicleType} • {captain?.vehicleNumber}</p>
                    </div>
                </div>
                <div className="text-right">
                    <h4 className="text-xl font-semibold">₹{earnings?.totalEarnings ?? 0}</h4>
                    <p className="text-sm text-slate-600">Wallet ₹{earnings?.walletBalance ?? 0}</p>
                    <p className="text-sm text-slate-600">Total ({earnings?.count ?? earnings?.completedRides ?? 0} rides)</p>
                    <p className="text-xs text-slate-500">Today: ₹{earnings?.todayEarnings ?? 0} ({earnings?.todayRides ?? 0} rides)</p>
                    {earnings?.last7Days && Object.keys(earnings.last7Days).length > 0 && (
                        <details className="mt-1 text-left">
                            <summary className="cursor-pointer text-xs text-slate-500">Last 7 days (by date)</summary>
                            <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-slate-600">
                                {Object.entries(earnings.last7Days).sort((a, b) => b[0].localeCompare(a[0])).map(([ day, amt ]) => (
                                    <li key={day} className="flex justify-between gap-2 border-b border-slate-100 pb-0.5">
                                        <span>{day}</span>
                                        <span className="font-medium text-slate-800">₹{Math.round(amt)}</span>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            </div>

            {captain?.approved === false && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Waiting for admin approval — you cannot go online until approved.
                </p>
            )}

            <div className="flex items-center justify-between p-3 bg-slate-100 rounded-xl">
                <span className="text-sm font-medium text-slate-700">Go online to receive rides</span>
                <button
                    type="button"
                    onClick={handleToggleOnline}
                    disabled={togglingStatus || (!isOnline && !canGoOnline)}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition ${isOnline ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700'} disabled:opacity-50`}
                >
                    {togglingStatus ? '…' : isOnline ? 'Online' : 'Offline'}
                </button>
            </div>

            <div className="p-3 bg-slate-100 rounded-xl space-y-2">
                <p className="text-sm font-medium text-slate-600">Subscription</p>
                <p className={subscription?.active ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                    {subscription?.active ? 'Active' : 'Inactive — Subscribe to accept rides'}
                </p>
                {subscription?.subscription?.expiresAt && (
                    <div className="text-xs text-slate-600 space-y-1">
                        <p>Ends: <span className="font-medium">{new Date(subscription.subscription.expiresAt).toLocaleString()}</span></p>
                        {subscription?.active && (
                            <p>Time left: <span className="font-mono font-semibold text-emerald-700">{formatRemaining(subExpiresMs)}</span></p>
                        )}
                        {subscription?.subscription?.plan && (
                            <p>Plan: <span className="capitalize">{subscription.subscription.plan}</span></p>
                        )}
                    </div>
                )}
                {plansError && (
                    <p className="text-xs text-red-600">Could not load subscription prices. Check your connection and try again.</p>
                )}
                {!subscription?.active && planPrices && (
                    <div className="mt-3 space-y-2">
                        <select value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                            <option value="weekly">Weekly — ₹{planPrices.weekly}</option>
                            <option value="monthly">Monthly (Recommended) — ₹{planPrices.monthly}</option>
                            <option value="yearly">Yearly — ₹{planPrices.yearly}</option>
                        </select>
                        <button type="button" onClick={handleSubscribe} disabled={subscribing} className="w-full bg-emerald-600 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50">
                            {subscribing ? 'Activating...' : `Subscribe (₹${price}) — Cash`}
                        </button>
                    </div>
                )}
            </div>

            {rideHistory.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <p className="text-sm font-medium text-slate-700 bg-slate-50 px-3 py-2">Recent rides</p>
                    <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100 text-xs">
                        {rideHistory.slice(0, 8).map((r) => (
                            <li key={r._id} className="px-3 py-2 space-y-1">
                                <p className="text-slate-700 truncate">
                                    {normalizeLocationText(r.pickupLocation)} {'->'} {normalizeLocationText(r.dropLocation)}
                                </p>
                                <div className="flex items-center justify-between gap-2 text-slate-500">
                                    <span className="truncate">{r.vehicleType || '—'} · {r.paymentMethod || '—'}</span>
                                    <span className="shrink-0 font-medium text-slate-700">
                                        ₹{r.captainNetEarning != null ? Number(r.captainNetEarning) : Number(r.price || 0)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="capitalize text-[11px] rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{r.status || '—'}</span>
                                    <span className="text-[11px] text-slate-500">{formatDateTime(r.completedAt || r.createdAt) || '—'}</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {rideHistory.length === 0 && (
                <div className="border border-dashed border-slate-300 rounded-xl px-3 py-4 text-xs text-slate-500">
                    Booking history not available yet. Completed rides will appear here.
                </div>
            )}
        </div>
    )
}

export default CaptainDetails
