import React from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, withCaptainAuth } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'
import { formatApiError } from '../utils/apiError'
import { getPlaceholderAvatarUrl } from '../config/externalEndpoints'

function normalizeLocationText (value, fallback = '—') {
    if (typeof value === 'string') return value
    if (value && typeof value === 'object') {
        if (typeof value.name === 'string') return value.name
        if (Array.isArray(value.coordinates)) return `${value.coordinates[1]}, ${value.coordinates[0]}`
    }
    return fallback
}

function normalizePersonName (user) {
    if (!user) return 'Rider'
    if (typeof user === 'string') return user
    if (typeof user.name === 'string') return user.name
    const first = user?.fullname?.firstname
    const last = user?.fullname?.lastname
    const full = [ first, last ].filter(Boolean).join(' ').trim()
    return full || 'Rider'
}

function formatKm (n) {
    if (n == null || !Number.isFinite(Number(n))) return '—'
    const v = Number(n)
    return `${Math.round(v * 10) / 10} km`
}

const FinishRide = (props) => {
    const navigate = useNavigate()
    const { ride, setFinishRidePanel, startOtp } = props
    const [ ending, setEnding ] = React.useState(false)

    async function endRide () {
        if (!ride?._id) return
        setEnding(true)
        try {
            const response = await apiClient.post('/rides/end-ride', {
                rideId: ride._id,
            }, withCaptainAuth())

            if (response.status === 200) {
                try {
                    sessionStorage.setItem('rideeasy_driver_last_completed_ride', String(ride._id))
                } catch { /* ignore */ }
                const payload = stripApiEnvelope(response.data)
                setFinishRidePanel(false)
                navigate('/captain-ride-complete', {
                    state: { ride: payload, startOtp: startOtp || '' },
                })
            }
        } catch (err) {
            alert(err.response?.data?.message || formatApiError(err) || 'Could not complete ride. Please start ride first.')
        } finally {
            setEnding(false)
        }
    }

    const pickup = normalizeLocationText(ride?.pickupLocation || ride?.pickup)
    const drop = normalizeLocationText(ride?.dropLocation || ride?.destination)
    const fare = ride?.price ?? ride?.fare
    const pm = ride?.paymentMethod || 'Cash'

    return (
        <div className="relative text-zinc-100">
            <button
                type="button"
                className="absolute -top-1 left-0 right-0 z-10 flex w-full justify-center py-1"
                onClick={() => setFinishRidePanel(false)}
                aria-label="Close"
            >
                <i className="text-3xl text-zinc-500 ri-arrow-down-wide-line" />
            </button>
            <h3 className="mb-4 mt-6 text-xl font-semibold text-white">Finish this ride</h3>

            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-zinc-900/90 p-4 shadow-lg shadow-black/30">
                <div className="flex min-w-0 items-center gap-3">
                    <img className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-zinc-700" src={getPlaceholderAvatarUrl()} alt="" />
                    <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-white">{normalizePersonName(ride?.user)}</h2>
                        <p className="text-xs text-zinc-500">{pm} · {formatKm(ride?.distance)}</p>
                    </div>
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/80">
                <div className="flex items-start gap-3 border-b border-zinc-800 p-3">
                    <i className="ri-map-pin-user-fill mt-0.5 text-emerald-500" />
                    <div className="min-w-0">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Pickup</p>
                        <p className="text-sm font-medium text-zinc-100">{pickup}</p>
                    </div>
                </div>
                <div className="flex items-start gap-3 border-b border-zinc-800 p-3">
                    <i className="ri-map-pin-2-fill mt-0.5 text-emerald-500" />
                    <div className="min-w-0">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Drop</p>
                        <p className="text-sm font-medium text-zinc-100">{drop}</p>
                    </div>
                </div>
                <div className="flex items-start gap-3 p-3">
                    <i className="ri-currency-line mt-0.5 text-emerald-500" />
                    <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Fare</p>
                        <p className="text-lg font-semibold text-white">₹{fare ?? '—'}</p>
                    </div>
                </div>
            </div>

            <p className="mt-4 text-center text-xs text-zinc-500">
                You’ll see trip summary, earnings, and payment on the next screen.
            </p>

            <button
                type="button"
                onClick={endRide}
                disabled={ending}
                className="mt-4 w-full rounded-xl bg-emerald-600 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-900/25 hover:bg-emerald-500 disabled:opacity-50"
            >
                {ending ? 'Completing…' : 'End ride'}
            </button>
        </div>
    )
}

export default FinishRide
