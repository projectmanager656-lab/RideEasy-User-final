const axios = require('axios');

/**
 * Optional Google Distance Matrix — not wired into routes; app uses OSRM instead.
 */
async function getDrivingEta(pickupLat, pickupLng, dropLat, dropLng) {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return null;
    try {
        const { data } = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
            params: {
                origins: `${pickupLat},${pickupLng}`,
                destinations: `${dropLat},${dropLng}`,
                key,
                mode: 'driving',
            },
        });
        const el = data?.rows?.[0]?.elements?.[0];
        if (!el || el.status !== 'OK') return null;
        return {
            distanceMeters: el.distance.value,
            durationSeconds: el.duration.value,
            durationMinutes: Math.ceil(el.duration.value / 60),
        };
    } catch {
        return null;
    }
}

module.exports = { getDrivingEta };
