import React, { useMemo } from 'react'

const VehiclePanel = (props) => {
    const fare = props.fare || {}
    const city = (props.city || '').toLowerCase()
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

    const priceFor = (v) => (fare[v.key] ?? fare[v.id] ?? '—')

    const selectedVehicle = vehicles.find((v) => v.id === selected)
    const primaryLabel = selected ? `Continue with ${selectedVehicle?.label || selected}` : 'Choose a ride'
    return (
        <div className="relative">
            {/* Handle + collapse */}
            <button
                type="button"
                className="absolute -top-2 left-0 right-0 flex items-center justify-center"
                onClick={() => props.setVehiclePanel(false)}
            >
                <div className="h-1.5 w-12 rounded-full bg-slate-300" />
            </button>

            <div className="pt-2">
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                        <h3 className="text-xl font-semibold">Choose a ride</h3>
                        <p className="text-sm text-slate-600">{city ? city.charAt(0).toUpperCase() + city.slice(1) : '—'} • {fare.distanceKm ?? '—'} km • {fare.durationMinutes ?? '—'} min</p>
                    </div>
                    <button
                        type="button"
                        className="h-9 w-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center"
                        onClick={() => props.setVehiclePanel(false)}
                        aria-label="Close"
                    >
                        <i className="ri-close-line text-xl" />
                    </button>
                </div>

                <div className="space-y-2 max-h-[46vh] overflow-auto pr-1">
                    {vehicles.map((v) => {
                        const active = selected === v.id
                        return (
                            <button
                                key={v.id}
                                type="button"
                                onClick={() => props.onSelectVehicle?.(v.id)}
                                className={[
                                    'w-full text-left rounded-2xl border p-3 flex items-center justify-between gap-3 transition',
                                    active ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'
                                ].join(' ')}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                                        <i className={`${iconFor(v.id)} text-xl`} />
                                    </div>
                                    <div>
                                        <div className="font-semibold">{v.label}</div>
                                        <div className="text-xs text-slate-600">{titleFor(v)}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-semibold">₹{priceFor(v)}</div>
                                    <div className="text-xs text-slate-500">incl. fees</div>
                                </div>
                            </button>
                        )
                    })}
                </div>

                <div className="mt-4 sticky bottom-0 bg-white pt-3 pb-2">
                    <button
                        type="button"
                        disabled={!selected}
                        onClick={() => props.onContinue?.()}
                        className={`w-full rounded-2xl py-3 font-semibold ${selected ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'}`}
                    >
                        {primaryLabel}
                    </button>
                    <p className="text-xs text-slate-500 mt-2">You can change payment method in the next step.</p>
                </div>
            </div>
        </div>
    )
}

export default VehiclePanel
