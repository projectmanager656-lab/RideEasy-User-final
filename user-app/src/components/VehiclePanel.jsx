import React, { useMemo } from 'react'

const VehiclePanel = (props) => {
    const fare = props.fare || {}
    const city = (props.city || '').toLowerCase()
    /** Cab → Bike → Auto — three API tiers only (CAR / BIKE / AUTO). */
    const vehicles = [
        { id: 'CAR', label: 'Cab', desc: 'Comfortable cab ride', key: 'CAR' },
        { id: 'BIKE', label: 'Bike', desc: 'Quick & economical', key: 'BIKE' },
        { id: 'AUTO', label: 'Auto', desc: 'Affordable auto rides', key: 'AUTO' },
    ]

    const selected = props.selectedVehicle || null
    const durationText = useMemo(() => {
        if (fare.durationMinutes == null) return null
        return `${fare.durationMinutes} min away`
    }, [fare.durationMinutes])

    const iconFor = (id) => {
        switch (id) {
            case 'BIKE': return 'ri-motorbike-fill'
            case 'AUTO': return 'ri-taxi-fill'
            case 'CAR': return 'ri-car-fill'
            default: return 'ri-car-fill'
        }
    }

    const titleFor = (v) => {
        const n = fare.distanceKm != null ? `${fare.distanceKm} km` : null
        const t = durationText
        const meta = [t, n].filter(Boolean).join(' • ')
        return meta || v.desc
    }

    const priceFor = (v) => {
        const raw = fare[v.key] ?? fare[v.id]
        const n = Number(raw)
        return Number.isFinite(n) && n > 0 ? n : null
    }

    const selectedVehicle = vehicles.find((v) => v.id === selected) || null
    const primaryLabel = selectedVehicle ? `Continue with ${selectedVehicle.label}` : 'Choose a ride'
    return (
        <div className="relative flex h-full min-h-0 flex-1 flex-col">
            {/* Handle + collapse */}
            <button
                type="button"
                className="absolute -top-2 left-0 right-0 z-10 flex items-center justify-center"
                onClick={() => props.setVehiclePanel(false)}
            >
                <div className="h-1.5 w-12 rounded-full bg-zinc-600" />
            </button>

            <div className="flex min-h-0 flex-1 flex-col pt-2">
                <div className="relative mx-auto mb-3 w-full max-w-md shrink-0 px-1">
                    <button
                        type="button"
                        className="absolute right-0 top-0 z-10 h-9 w-9 rounded-full bg-zinc-800 text-zinc-200 flex items-center justify-center border border-zinc-700"
                        onClick={() => props.setVehiclePanel(false)}
                        aria-label="Close"
                    >
                        <i className="ri-close-line text-xl" />
                    </button>
                    <div className="px-10 text-center">
                        <h3 className="text-xl font-semibold text-zinc-100">Choose a ride</h3>
                        <p className="text-sm text-zinc-400">
                            {city ? city.charAt(0).toUpperCase() + city.slice(1) : '—'} • {fare.distanceKm ?? '—'} km • {fare.durationMinutes ?? '—'} min
                        </p>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">
                    <div className="mx-auto flex w-full max-w-md flex-col gap-2 pb-2">
                        {vehicles.map((v) => {
                            const active = selected === v.id
                            const price = priceFor(v)
                            return (
                                <button
                                    key={v.id}
                                    type="button"
                                    onClick={() => props.onSelectVehicle?.(v.id)}
                                    disabled={price == null}
                                    className={[
                                        'w-full rounded-2xl border p-3 flex items-center justify-between gap-3 transition',
                                        active ? 'border-emerald-500 bg-emerald-950/40' : 'border-zinc-700 bg-zinc-900/80 hover:border-zinc-500',
                                        price == null ? 'opacity-50 cursor-not-allowed' : ''
                                    ].join(' ')}
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className={`h-11 w-11 shrink-0 rounded-xl flex items-center justify-center ${active ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-200'}`}>
                                            <i className={`${iconFor(v.id)} text-xl`} />
                                        </div>
                                        <div className="min-w-0 text-left">
                                            <div className="font-semibold text-zinc-100">{v.label}</div>
                                            <div className="text-xs text-zinc-400">{titleFor(v)}</div>
                                        </div>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <div className="font-semibold text-zinc-100">{price != null ? `₹${price}` : 'Unavailable'}</div>
                                        <div className="text-xs text-zinc-500">{price != null ? 'incl. fees' : ''}</div>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>

                <div className="mx-auto w-full max-w-md shrink-0 border-t border-zinc-800 bg-zinc-950 pt-3 pb-1">
                    <button
                        type="button"
                        disabled={!selected}
                        onClick={() => props.onContinue?.()}
                        className={`w-full rounded-2xl py-3 font-semibold ${selected ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-zinc-800 text-zinc-500'}`}
                    >
                        {primaryLabel}
                    </button>
                    <p className="mt-2 text-center text-xs text-zinc-500">You can change payment method in the next step.</p>
                </div>
            </div>
        </div>
    )
}

export default VehiclePanel
