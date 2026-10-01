/**
 * Passenger-facing ride categories shown on the "Choose a ride" screen.
 *
 * The backend only computes fares for BIKE / AUTO / CAR (see /rides/get-fare),
 * so each reference category maps to a backend vehicle type used by /rides/create.
 * `fare` and `etaMinutes` are reference UI values; the backend recomputes the
 * final price from distance, so the charged amount may differ from the reference.
 */
export const RIDE_TIERS = [
    {
        id: 'ECONOMY',
        label: 'Auto',
        desc: 'Affordable 3-wheeler option',
        icon: 'ri-taxi-fill',
        fare: 120,
        etaMinutes: 4,
        vehicleType: 'AUTO',
        capacity: 3,
        features: [ 'Lowest fare', 'Quick pickup' ],
    },
    {
        id: 'COMFORT',
        label: 'RideEasy Go',
        desc: 'Affordable AC car',
        icon: 'ri-car-fill',
        fare: 160,
        etaMinutes: 5,
        vehicleType: 'CAR',
        capacity: 4,
        features: [ 'AC comfort', 'Great value' ],
    },
    {
        id: 'PREMIUM',
        label: 'RideEasy Premier',
        desc: 'Premium & comfortable car',
        icon: 'ri-crown-fill',
        fare: 220,
        etaMinutes: 6,
        vehicleType: 'CAR',
        capacity: 4,
        features: [ 'Premium comfort', 'Top-rated drivers' ],
    },
    {
        id: 'XL',
        label: 'RideEasy XL',
        desc: 'SUV for group travel',
        icon: 'ri-caravan-fill',
        fare: 280,
        etaMinutes: 8,
        vehicleType: 'CAR',
        capacity: 6,
        features: [ 'Group capacity', 'Luggage space' ],
    },
    {
        id: 'BIKE',
        label: 'Bike',
        desc: 'Fast bike ride',
        icon: 'ri-motorbike-line',
        fare: 80,
        etaMinutes: 3,
        vehicleType: 'BIKE',
        capacity: 1,
        features: [ 'Quick pickup', 'Lowest fare' ],
    },
]

/**
 * Deterministic ride recommendation based on real trip data.
 * Cheap rides are recommended for short trips; comfort tiers are
 * suggested once distance grows. No fabricated availability.
 */
export function findRecommendedTier (distanceKm) {
    const d = Number(distanceKm)
    if (Number.isFinite(d) && d > 0) {
        if (d >= 25) return RIDE_TIERS.find((t) => t.id === 'PREMIUM') || null
        if (d >= 12) return RIDE_TIERS.find((t) => t.id === 'COMFORT') || null
    }
    return RIDE_TIERS.find((t) => t.id === 'ECONOMY') || null
}

export function findRideTier (id) {
    return RIDE_TIERS.find((t) => t.id === id) || null
}

export function findTierByBackendType (backendType) {
    const t = String(backendType || '').toUpperCase()
    return RIDE_TIERS.find((x) => x.vehicleType === t) || null
}

export function tierBackendType (id) {
    return findRideTier(id)?.vehicleType || null
}

export function tierLabel (id) {
    return findRideTier(id)?.label || String(id || '')
}

export function tierFare (id) {
    return findRideTier(id)?.fare ?? null
}

export function tierIcon (id) {
    return findRideTier(id)?.icon || 'ri-roadster-line'
}