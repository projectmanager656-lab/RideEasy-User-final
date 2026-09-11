import React, { useContext, useEffect, useState, useCallback } from 'react'
import { useLanguage } from '../i18n'
import { CaptainDataContext } from '../context/CaptainContext'
import axios from 'axios'
import { API_BASE_URL } from '../config/apiBaseUrl'
import { getCaptainToken } from '../utils/authTokens'
import { stripApiEnvelope } from '../utils/apiBody'

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
    const { t } = useLanguage()
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
        const token = getCaptainToken()
        axios.get(`${API_BASE_URL}/driver-subscriptions/my-status`, { headers: { Authorization: `Bearer ${token}` } })
            .then((res) => setSubscription(res.data))
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
        const token = getCaptainToken()
        axios.get(`${API_BASE_URL}/captains/earnings`, { headers: { Authorization: `Bearer ${token}` } })
            .then((res) => setEarnings(stripApiEnvelope(res.data)))
            .catch(() => setEarnings({ totalEarnings: 0, count: 0, todayEarnings: 0, todayRides: 0 }))
        refreshSubscription()
        axios.get(`${API_BASE_URL}/driver-subscriptions/plans`)
            .then((res) => {
                setPlans(res.data?.plans || null)
                setPlansError(false)
            })
            .catch(() => {
                setPlans(null)
                setPlansError(true)
            })
        axios.get(`${API_BASE_URL}/captains/rides/history`, { headers: { Authorization: `Bearer ${token}` } })
            .then((res) => setRideHistory(stripApiEnvelope(res.data)?.rides || []))
            .catch(() => setRideHistory([]))
    }, [captain?._id, refreshSubscription])

    const handleToggleOnline = () => {
        const next = isOnline ? 'inactive' : 'active'
        setTogglingStatus(true)
        const token = getCaptainToken()
        axios.post(`${API_BASE_URL}/captains/status`, { status: next }, { headers: { Authorization: `Bearer ${token}` } })
            .then((res) => {
                const st = res.data?.status
                setIsOnline(st === 'active')
                if (setCaptain) setCaptain((prev) => ({ ...(prev || {}), status: st }))
            })
            .catch((e) => alert(e.response?.data?.message || t('status_update_failed')))
            .finally(() => setTogglingStatus(false))
    }

    const displayName = captain?.name || (captain?.fullname ? `${captain.fullname.firstname || ''} ${captain.fullname.lastname || ''}`.trim() : '') || 'Driver'
    const vt = captain?.vehicleType === 'BIKE' ? 'BIKE' : captain?.vehicleType === 'AUTO' ? 'AUTO' : 'CAR'
    const planPrices = plans?.[vt]
    const price = planPrices?.[selectedPlan]

    const handleSubscribe = () => {
        if (!price) return
        setSubscribing(true)
        const token = getCaptainToken()
        axios.post(`${API_BASE_URL}/driver-subscriptions/create`, {
            driverId: captain._id,
            plan: selectedPlan,
            paymentMode: 'Cash'
        }, { headers: { Authorization: `Bearer ${token}` } })
            .then(() => {
                refreshSubscription()
            })
            .catch((e) => alert(e.response?.data?.message || t('subscribe_failed')))
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
                        <h4 className="font-medium text-theme-primary">{displayName}</h4>
                        <p className="text-sm text-theme-muted">{captain?.vehicleType} • {captain?.vehicleNumber}</p>
                    </div>
                </div>
                <div className="text-right">
                    <h4 className="text-xl font-semibold text-theme-primary">₹{earnings?.totalEarnings ?? 0}</h4>
                    <p className="text-sm text-theme-muted">{t('wallet')} ₹{earnings?.walletBalance ?? 0}</p>
                    <p className="text-sm text-theme-muted">{t('total_rides_label', { rides: earnings?.count ?? earnings?.completedRides ?? 0 })}</p>
                    <p className="text-xs text-theme-muted">{t('today_rides_label', { amount: earnings?.todayEarnings ?? 0, rides: earnings?.todayRides ?? 0 })}</p>
                    {earnings?.last7Days && Object.keys(earnings.last7Days).length > 0 && (
                        <details className="mt-1 text-left">
                            <summary className="cursor-pointer text-xs text-theme-muted">{t('last_7_days')}</summary>
                            <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-theme-muted">
                                {Object.entries(earnings.last7Days).sort((a, b) => b[0].localeCompare(a[0])).map(([ day, amt ]) => (
                                    <li key={day} className="flex justify-between gap-2 border-b border-theme pb-0.5">
                                        <span>{day}</span>
                                        <span className="font-medium text-theme-primary">₹{Math.round(amt)}</span>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            </div>

            {captain?.approved === false && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {t('waiting_admin_approval')}
                </p>
            )}

            <div className="flex items-center justify-between p-3 bg-theme-card-muted rounded-xl">
                <span className="text-sm font-medium text-theme-secondary">{t('go_online_receive_rides')}</span>
                <button
                    type="button"
                    onClick={handleToggleOnline}
                    disabled={togglingStatus || (!isOnline && !canGoOnline)}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition ${isOnline ? 'bg-emerald-600 text-white' : 'bg-theme-card-muted text-theme-secondary'} disabled:opacity-50`}
                >
                    {togglingStatus ? '…' : isOnline ? t('online') : t('offline')}
                </button>
            </div>

            <div className="p-3 bg-theme-card-muted rounded-xl space-y-2">
                <p className="text-sm font-medium text-theme-secondary">{t('subscription')}</p>
                <p className={subscription?.active ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                    {subscription?.active ? t('active') : t('inactive_subscribe')}
                </p>
                {subscription?.subscription?.expiresAt && (
                    <div className="text-xs text-theme-muted space-y-1">
                        <p>{t('subscription_ends')} <span className="font-medium text-theme-secondary">{new Date(subscription.subscription.expiresAt).toLocaleString()}</span></p>
                        {subscription?.active && (
                            <p>{t('subscription_time_left')} <span className="font-mono font-semibold text-emerald-700">{formatRemaining(subExpiresMs)}</span></p>
                        )}
                        {subscription?.subscription?.plan && (
                            <p>{t('subscription_plan')} <span className="capitalize text-theme-secondary">{subscription.subscription.plan}</span></p>
                        )}
                    </div>
                )}
                {plansError && (
                    <p className="text-xs text-red-600">{t('plan_prices_error')}</p>
                )}
                {!subscription?.active && planPrices && (
                    <div className="mt-3 space-y-2">
                        <select value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)} className="w-full rounded-lg border border-theme-strong px-3 py-2 text-sm bg-theme-input text-theme-primary">
                            <option value="weekly">{t('plan_weekly', { price: planPrices.weekly })}</option>
                            <option value="monthly">{t('plan_monthly', { price: planPrices.monthly })}</option>
                            <option value="yearly">{t('plan_yearly', { price: planPrices.yearly })}</option>
                        </select>
                        <button type="button" onClick={handleSubscribe} disabled={subscribing} className="w-full bg-emerald-600 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50">
                            {subscribing ? t('activating') : t('subscribe_with_price', { price })}
                        </button>
                    </div>
                )}
            </div>

            {rideHistory.length > 0 && (
                <div className="border border-theme rounded-xl overflow-hidden">
                    <p className="text-sm font-medium text-theme-secondary bg-theme-card-muted px-3 py-2">{t('recent_rides')}</p>
                    <ul className="max-h-56 overflow-y-auto divide-y divide-theme-border text-xs">
                        {rideHistory.slice(0, 8).map((r) => (
                            <li key={r._id} className="px-3 py-2 space-y-1">
                                <p className="text-theme-secondary truncate">
                                    {normalizeLocationText(r.pickupLocation)} {'->'} {normalizeLocationText(r.dropLocation)}
                                </p>
                                <div className="flex items-center justify-between gap-2 text-theme-muted">
                                    <span className="truncate">{r.vehicleType || '—'} · {r.paymentMethod || '—'}</span>
                                    <span className="shrink-0 font-medium text-theme-secondary">
                                        ₹{r.captainNetEarning != null ? Number(r.captainNetEarning) : Number(r.price || 0)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="capitalize text-[11px] rounded-full bg-theme-card-muted px-2 py-0.5 text-theme-muted">{r.status || '—'}</span>
                                    <span className="text-[11px] text-theme-muted">{formatDateTime(r.completedAt || r.createdAt) || '—'}</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {rideHistory.length === 0 && (
                <div className="border border-dashed border-theme-strong rounded-xl px-3 py-4 text-xs text-theme-muted">
                    {t('no_booking_history')}
                </div>
            )}
        </div>
    )
}

export default CaptainDetails
