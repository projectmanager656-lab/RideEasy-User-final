/**
 * Configured service-area dataset for deterministic prefix search.
 *
 * Real, well-known places inside RideEasy's served belt (Kolhapur,
 * Ichalkaranji and Sangli). Used so that even a one-character query returns
 * stable, relevant suggestions without depending on an external API. The
 * live Photon API is still used to enrich longer queries (>= 3 chars).
 *
 * Coordinates are approximate map positions of the named place.
 */

export const SERVICE_AREA_PLACES = [
    { name: 'Kolhapur', area: 'Kolhapur', lat: 16.705, lng: 74.243 },
    { name: 'Kolhapur Railway Station', area: 'Kolhapur', lat: 16.7025, lng: 74.2363 },
    { name: 'Kolhapur Central Bus Stand', area: 'Kolhapur', lat: 16.7045, lng: 74.2381 },
    { name: 'Kolhapur Airport', area: 'Kolhapur', lat: 16.6648, lng: 74.2908 },
    { name: 'Mahalakshmi Temple', area: 'Kolhapur', lat: 16.7001, lng: 74.2236 },
    { name: 'Rankala Lake', area: 'Kolhapur', lat: 16.7129, lng: 74.2197 },
    { name: 'New Palace', area: 'Kolhapur', lat: 16.7048, lng: 74.2329 },
    { name: 'Town Hall', area: 'Kolhapur', lat: 16.7051, lng: 74.2338 },
    { name: 'Bhavani Mandap', area: 'Kolhapur', lat: 16.704, lng: 74.232 },
    { name: 'Juna Rajwada', area: 'Kolhapur', lat: 16.7005, lng: 74.224 },
    { name: 'Rajarampuri', area: 'Kolhapur', lat: 16.7012, lng: 74.2312 },
    { name: 'Shahupuri', area: 'Kolhapur', lat: 16.7073, lng: 74.2337 },
    { name: 'Tarabai Park', area: 'Kolhapur', lat: 16.7109, lng: 74.242 },
    { name: 'Kawala Naka', area: 'Kolhapur', lat: 16.7189, lng: 74.2416 },
    { name: 'Sambhajinagar', area: 'Kolhapur', lat: 16.715, lng: 74.23 },
    { name: 'Gandhi Nagar', area: 'Kolhapur', lat: 16.7075, lng: 74.236 },
    { name: 'Ujalaiwadi', area: 'Kolhapur', lat: 16.6817, lng: 74.2617 },
    { name: 'Market Yard', area: 'Kolhapur', lat: 16.6978, lng: 74.2389 },
    { name: 'Kasba Bawada', area: 'Kolhapur', lat: 16.6906, lng: 74.2397 },
    { name: 'Phulewadi', area: 'Kolhapur', lat: 16.7039, lng: 74.2294 },
    { name: 'Somwar Peth', area: 'Kolhapur', lat: 16.6997, lng: 74.2206 },
    { name: 'Bindu Chowk', area: 'Kolhapur', lat: 16.7005, lng: 74.2242 },
    { name: 'Ruikar Colony', area: 'Kolhapur', lat: 16.7075, lng: 74.219 },
    { name: 'Caves Road', area: 'Kolhapur', lat: 16.7101, lng: 74.2352 },
    { name: 'Panhala Fort', area: 'Kolhapur', lat: 16.8111, lng: 74.1017 },
    { name: 'Panhala', area: 'Kolhapur', lat: 16.8108, lng: 74.1 },
    { name: 'Jyotiba Temple', area: 'Kolhapur', lat: 16.8439, lng: 74.1026 },
    { name: 'Ajra', area: 'Kolhapur', lat: 15.9986, lng: 74.2117 },
    { name: 'Shirol', area: 'Kolhapur', lat: 16.723, lng: 74.453 },
    { name: 'Ichalkaranji', area: 'Ichalkaranji', lat: 16.6917, lng: 74.4592 },
    { name: 'Ichalkaranji Bus Stand', area: 'Ichalkaranji', lat: 16.6969, lng: 74.459 },
    { name: 'Laxmi Market', area: 'Ichalkaranji', lat: 16.6946, lng: 74.459 },
    { name: 'Shivaji Chowk', area: 'Ichalkaranji', lat: 16.693, lng: 74.46 },
    { name: 'Udyamnagar', area: 'Ichalkaranji', lat: 16.699, lng: 74.451 },
    { name: 'Chitranagari', area: 'Ichalkaranji', lat: 16.7005, lng: 74.465 },
    { name: 'Sangli', area: 'Sangli', lat: 16.8524, lng: 74.5815 },
    { name: 'Sangli Railway Station', area: 'Sangli', lat: 16.8625, lng: 74.5752 },
    { name: 'Sangli Bus Stand', area: 'Sangli', lat: 16.8575, lng: 74.5695 },
    { name: 'Vishrambag', area: 'Sangli', lat: 16.861, lng: 74.57 },
    { name: 'Madhavnagar', area: 'Sangli', lat: 16.849, lng: 74.585 },
    { name: 'Kupwad', area: 'Sangli', lat: 16.894, lng: 74.605 },
    { name: 'Haripur', area: 'Sangli', lat: 16.844, lng: 74.566 },
    { name: 'Vasant Vihar', area: 'Sangli', lat: 16.8585, lng: 74.563 },
    { name: 'Ganapati Peth', area: 'Sangli', lat: 16.853, lng: 74.578 },
    { name: 'Vijaynagar', area: 'Sangli', lat: 16.866, lng: 74.589 },
    { name: 'Miraj', area: 'Sangli', lat: 16.825, lng: 74.635 },
    { name: 'Kadegaon', area: 'Sangli', lat: 17.3, lng: 74.53 },
]

const PLACES_INDEX = SERVICE_AREA_PLACES.map((p) => ({
    ...p,
    lower: p.name.toLowerCase(),
    words: p.name.toLowerCase().split(/\s+/),
}))

/**
 * Deterministic prefix search over the configured dataset.
 * Matches when the whole name OR any word of the name starts with the query,
 * sorted so full-name prefixes come first, then alphabetical.
 */
export function searchServiceAreaPlaces(query, limit = 8) {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return []

    const matches = PLACES_INDEX.filter((p) => {
        if (p.lower.startsWith(q)) return true
        return p.words.some((w) => w.startsWith(q))
    })

    matches.sort((a, b) => {
        const aFull = a.lower.startsWith(q) ? 0 : 1
        const bFull = b.lower.startsWith(q) ? 0 : 1
        if (aFull !== bFull) return aFull - bFull
        return a.lower.localeCompare(b.lower)
    })

    return matches.slice(0, limit).map(({ lower: _l, words: _w, ...rest }) => rest)
}