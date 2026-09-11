const axios = require('axios');
const { isWithinServiceArea } = require('../utils/serviceArea');
const { SERVICE_AREAS } = require('../config/serviceAreas');

const OSRM_BASE_URL = (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const PHOTON_API_URL = (process.env.PHOTON_API_URL || 'https://photon.komoot.io/api').replace(/\/$/, '');
/** Western Maharashtra — Kolhapur / Ichalkaranji / Sangli corridor */
const PHOTON_BBOX = process.env.PHOTON_BBOX || '73.2,16.25,76.3,17.15';
const PHOTON_BIAS_LAT = Number(process.env.PHOTON_BIAS_LAT || 16.77);
const PHOTON_BIAS_LON = Number(process.env.PHOTON_BIAS_LON || 74.35);

/** Photon location bias: optional service city (Kolhapur / Ichalkaranji / Sangli). */
function photonBiasFromCityKey (cityKey) {
    const k = normalizeText(cityKey);
    if (!k) return { lat: PHOTON_BIAS_LAT, lng: PHOTON_BIAS_LON };
    const z = SERVICE_AREAS.find((a) => a.key.toLowerCase() === k.toLowerCase());
    if (z) return { lat: z.lat, lng: z.lng };
    return { lat: PHOTON_BIAS_LAT, lng: PHOTON_BIAS_LON };
}

function normalizeText(value) {
    return (typeof value === 'string' ? value : '').trim();
}

function coordsFromFeature(f) {
    const c = f?.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2) return null;
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
}

/** Bias vague names (e.g. "Bus Stop") toward India; avoids Photon picking a distant homonym. */
function enrichRegionalQuery(q) {
    const s = normalizeText(q);
    if (!s) return s;
    const low = s.toLowerCase();
    if (low.includes('maharashtra') || low.includes('india')) return s;
    return `${s}, Maharashtra, India`;
}

function firstInServiceArea(features) {
    for (const f of features) {
        const pt = coordsFromFeature(f);
        if (pt && isWithinServiceArea(pt.lat, pt.lng)) return pt;
    }
    return null;
}

async function photonSearch(q, limit = 8, biasLatLon = null) {
    const query = normalizeText(q);
    if (!query) throw new Error('Input required');

    const lang = query.match(/[\u0900-\u097F]/) ? 'mr' : 'en';
    const b = biasLatLon || { lat: PHOTON_BIAS_LAT, lng: PHOTON_BIAS_LON };

    const response = await axios.get(PHOTON_API_URL, {
        timeout: 8000,
        headers: { 'User-Agent': 'RideEasy/1.0' },
        params: {
            q: query,
            limit,
            lang,
            bbox: PHOTON_BBOX,
            lat: b.lat,
            lon: b.lng,
            location_bias_scale: 0.6,
        }
    });

    return response.data?.features || [];
}

module.exports.getAutoCompleteSuggestions = async (input, options = {}) => {
    const bias = photonBiasFromCityKey(options.city);
    const features = await photonSearch(input, 8, bias);
    return features
        .map((f) => {
            const name = f.properties?.name || f.properties?.street || '';
            const label = f.properties?.label || '';
            const coords = f.geometry?.coordinates; // [lng, lat]
            return {
                name: label || name,
                lat: coords?.[1] ?? null,
                lng: coords?.[0] ?? null,
            };
        })
        .filter((s) => s.name);
};

/**
 * Resolve free-text to coordinates. Prefer a Photon hit that lies inside a service circle
 * (same validation as rides) so "Rankala Lake" / "Bus Stop" map to local results, not the first global hit.
 */
module.exports.getAddressCoordinate = async (address) => {
    const base = normalizeText(address);
    if (!base) throw new Error('Input required');

    let features = await photonSearch(base, 15);
    let pt = firstInServiceArea(features);
    if (pt) return pt;

    const enriched = enrichRegionalQuery(base);
    if (enriched !== base) {
        features = await photonSearch(enriched, 15);
        pt = firstInServiceArea(features);
        if (pt) return pt;
    }

    const f = features[0] || (await photonSearch(base, 5))[0];
    const fallback = coordsFromFeature(f);
    if (!fallback) throw new Error('Unable to fetch coordinates');
    return fallback;
};

module.exports.getDistanceTime = async (origin, destination) => {
    const o = await module.exports.getAddressCoordinate(origin);
    const d = await module.exports.getAddressCoordinate(destination);

    return module.exports.getDistanceTimeCoords(o, d);
};

/** OSRM leg between two { lat, lng } points — same shape as getDistanceTime (meters / seconds). */
module.exports.getDistanceTimeCoords = async (o, d) => {
    const lat1 = Number(o?.lat);
    const lng1 = Number(o?.lng);
    const lat2 = Number(d?.lat);
    const lng2 = Number(d?.lng);
    if (![ lat1, lng1, lat2, lng2 ].every(Number.isFinite)) {
        throw new Error('Invalid coordinates');
    }
    const osrmRes = await axios.get(
        `${OSRM_BASE_URL}/route/v1/driving/${lng1},${lat1};${lng2},${lat2}`,
        { timeout: 10000, params: { overview: 'false' } }
    );

    const route = osrmRes.data?.routes?.[0];
    if (!route) throw new Error('No routes found');

    return {
        distance: { value: Math.round(route.distance) },
        duration: { value: Math.round(route.duration) },
    };
};

/**
 * OSRM driving route between two WGS84 points (lng, lat).
 * @param {string} overview - 'false' | 'simplified' | 'full' — false = duration/distance only (no geometry)
 */
module.exports.getDrivingRoute = async (fromLng, fromLat, toLng, toLat, options = {}) => {
    const lng1 = Number(fromLng);
    const lat1 = Number(fromLat);
    const lng2 = Number(toLng);
    const lat2 = Number(toLat);
    if (![ lng1, lat1, lng2, lat2 ].every(Number.isFinite)) {
        throw new Error('Invalid coordinates');
    }

    const overview = options.overview != null ? String(options.overview) : 'simplified';
    const params = { overview, steps: false };
    if (overview !== 'false') {
        params.geometries = 'geojson';
    }

    const osrmRes = await axios.get(
        `${OSRM_BASE_URL}/route/v1/driving/${lng1},${lat1};${lng2},${lat2}`,
        { timeout: 15000, params, headers: { 'User-Agent': 'RideEasy/1.0' } }
    );

    const route = osrmRes.data?.routes?.[0];
    if (!route) throw new Error('No route found');

    const out = {
        durationSec: route.duration,
        distanceMeters: route.distance,
    };

    if (route.geometry?.coordinates?.length) {
        out.coordinates = route.geometry.coordinates.map(([ lng, lat ]) => [ lat, lng ]);
    }

    return out;
};
