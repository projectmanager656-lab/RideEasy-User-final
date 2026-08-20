import React, { useMemo } from 'react'
import { RIDE_TIERS } from '../constants/rideTiers'

function fmtDist(km) {
    if (!Number.isFinite(km) || km < 0) return null
    return km < 1 ? `${Math.max(1, Math.round(km * 1000))} m` : `${km.toFixed(1)} km`
}

const VehiclePanel = (props) => {
    const fare = props.fare || {}
    const selectedVehicle = props.selectedVehicle || null
    const onSelectVehicle = props.onSelectVehicle || null
    const onContinue = props.onContinue || null

    const tripDuration = useMemo(() => {
        const m = Number(fare.durationMinutes)
        return Number.isFinite(m) && m > 0 ? `${m} min` : null
    }, [fare.durationMinutes])

    const tripDistance = useMemo(() => {
        const k = Number(fare.distanceKm)
        return Number.isFinite(k) && k > 0 ? `${fmtDist(k)}` : null
    }, [fare.distanceKm])

    const selectedTier = useMemo(() => RIDE_TIERS.find((t) => t.id === selectedVehicle) || null, [selectedVehicle])
    const selectedPrice = selectedTier ? selectedTier.fare : null

    const availableFares = useMemo(() => RIDE_TIERS.map((t) => t.fare).sort((a, b) => a - b), [])
    const fareRange = availableFares.length === 1
        ? `₹${availableFares[0]}`
        : `₹${availableFares[0]} - ₹${availableFares[availableFares.length - 1]}`

    return (
        <div className="relative flex h-full min-h-0 flex-1 flex-col">
            {/* Handle + collapse */}
            <button
                type="button"
                className="absolute -top-2 left-0 right-0 z-10 flex items-center justify-center"
                onClick={() => props.setVehiclePanel?.(false)}
            >
                <div className="h-1.5 w-12 rounded-full bg-zinc-600" />
            </button>

            <div className="relative flex-1 flex flex-col">
                {/* Header */}
                <header className="px-4 py-2 border-b border-zinc-700 bg-zinc-950">
                    <h3 className="text-xl font-semibold text-white">Choose a ride</h3>
                    <p className="text-sm text-zinc-400 mb-2">Select your preferred vehicle</p>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-500">Trip info</span>
                        <button
                            type="button"
                            className="rounded-full bg-zinc-800 text-zinc-200 px-2 py-0.5 text-xs font-medium"
                            aria-label="Close"
                            onClick={() => props.setVehiclePanel?.(false)}
                        >
                            <i className="ri-close-line text-xs" />
                        </button>
                    </div>
                </header>

                {/* Ride options */}
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                    {RIDE_TIERS.map((t) => {
                        const active = selectedVehicle === t.id
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => onSelectVehicle?.(t.id)}
                                className={[
                                    'w-full rounded-xl border p-3 flex items-center gap-3 transition',
                                    active
                                        ? 'border-yellow-400 bg-yellow-400/10 ring-1 ring-yellow-400/40'
                                        : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500',
                                ].join(' ')}
                            >
                                <div className="flex items-center gap-3 flex-1">
                                    <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0">
                                        <i className={`${t.icon} text-xl`} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold text-white line-clamp-1">{t.label}</div>
                                        <div className="text-[9px] text-zinc-400 line-clamp-1">{t.desc}</div>
                                    </div>
                                </div>
                                <div className="mt-1.5 text-right text-sm">
                                    <div className="font-semibold text-white">₹{t.fare}</div>
                                    <div className="text-[8px] text-zinc-400">{t.features?.[0]}</div>
                                    <div className="mt-0.5">
                                        {active ? 'Selected' : `${t.etaMinutes} min away`}
                                        {active && <i className="ri-check-line text-xs text-yellow-400" />}
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>

                {/* Footer */}
                <div className="px-4 pb-3 border-t border-zinc-800 bg-zinc-950">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Estimated fare</div>
                            <div className="text-lg font-semibold text-white">
                                {selectedPrice != null ? `₹${selectedPrice}` : fareRange || '—'}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Estimated time</div>
                            <div className="text-lg font-semibold text-white">
                                {tripDuration || '—'}
                            </div>
                        </div>
                    </div>
                    {tripDistance && <div className="text-right text-xs text-zinc-500">{tripDistance}</div>}
                    <button
                        type="button"
                        disabled={!selectedVehicle}
                        onClick={() => onContinue?.()}
                        className={`w-full rounded-2xl py-3 font-semibold ${selectedVehicle ? 'bg-yellow-400 text-black' : 'bg-zinc-800 text-zinc-500'}`}
                    >
                        Confirm Ride
                    </button>
                    <p className="mt-2 text-center text-xs text-zinc-500">You can change payment method in the next step.</p>
                </div>
            </div>
        </div>
    )
}

export default VehiclePanel