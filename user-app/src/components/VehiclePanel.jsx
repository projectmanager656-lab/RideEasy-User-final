import React, { useMemo } from 'react'
import { RIDE_TIERS } from '../constants/rideTiers'
import { useLanguage } from '../i18n'

function fmtDist(km) {
    if (!Number.isFinite(km) || km < 0) return null
    return km < 1 ? `${Math.max(1, Math.round(km * 1000))} m` : `${km.toFixed(1)} km`
}

const VehiclePanel = (props) => {
    const { t } = useLanguage()
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
                <div className="h-1.5 w-12 rounded-full bg-theme-card-muted" />
            </button>

            <div className="relative flex-1 flex flex-col">
                {/* Header */}
                <header className="px-4 py-2 border-b border-theme bg-theme-card">
                    <h3 className="text-xl font-semibold text-theme-primary">{t('choose_a_ride')}</h3>
                    <p className="text-sm text-theme-secondary mb-2">{t('select_preferred_vehicle')}</p>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-theme-muted">{t('trip_info')}</span>
                        <button
                            type="button"
                            className="rounded-full bg-theme-card-muted text-theme-primary px-2 py-0.5 text-xs font-medium"
                            aria-label={t('close')}
                            onClick={() => props.setVehiclePanel?.(false)}
                        >
                            <i className="ri-close-line text-xs" />
                        </button>
                    </div>
                </header>

                {/* Ride options */}
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                    {RIDE_TIERS.map((tier) => {
                        const active = selectedVehicle === tier.id
                        return (
                            <button
                                key={tier.id}
                                type="button"
                                onClick={() => onSelectVehicle?.(tier.id)}
                                className={[
                                    'w-full rounded-xl border p-3 flex items-center gap-3 transition',
                                    active
                                        ? 'border-yellow-400 bg-yellow-400/10 ring-1 ring-yellow-400/40'
                                        : 'border-theme bg-theme-card hover:border-theme-strong',
                                ].join(' ')}
                            >
                                <div className="flex items-center gap-3 flex-1">
                                    <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0">
                                        <i className={`${tier.icon} text-xl`} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold text-theme-primary line-clamp-1">{tier.label}</div>
                                        <div className="text-[9px] text-theme-secondary line-clamp-1">{tier.desc}</div>
                                    </div>
                                </div>
                                <div className="mt-1.5 text-right text-sm">
                                    <div className="font-semibold text-theme-primary">₹{tier.fare}</div>
                                    <div className="text-[8px] text-theme-secondary">{tier.features?.[0]}</div>
                                    <div className="mt-0.5">
                                        {active ? t('selected') : t('min_away', { count: tier.etaMinutes })}
                                        {active && <i className="ri-check-line text-xs text-yellow-400" />}
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>

                {/* Footer */}
                <div className="px-4 pb-3 border-t border-theme bg-theme-card">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <div className="text-xs font-medium uppercase tracking-wide text-theme-muted">{t('estimated_fare')}</div>
                            <div className="text-lg font-semibold text-theme-primary">
                                {selectedPrice != null ? `₹${selectedPrice}` : fareRange || '—'}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs font-medium uppercase tracking-wide text-theme-muted">{t('estimated_time')}</div>
                            <div className="text-lg font-semibold text-theme-primary">
                                {tripDuration || '—'}
                            </div>
                        </div>
                    </div>
                    {tripDistance && <div className="text-right text-xs text-theme-muted">{tripDistance}</div>}
                    <button
                        type="button"
                        disabled={!selectedVehicle}
                        onClick={() => onContinue?.()}
                        className={`w-full rounded-2xl py-3 font-semibold ${selectedVehicle ? 'bg-yellow-400 text-black' : 'bg-theme-card-muted text-theme-muted'}`}
                    >
                        {t('confirm_ride')}
                    </button>
                    <p className="mt-2 text-center text-xs text-theme-muted">{t('change_payment_next_step')}</p>
                </div>
            </div>
        </div>
    )
}

export default VehiclePanel