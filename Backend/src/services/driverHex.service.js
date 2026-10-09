/**
 * H3 hexagon driver discovery (resolution 9) for nearby-driver matching.
 *
 * H3 answers exactly ONE question: "which drivers should I check?" It never
 * decides final distance — every candidate coming out of the hexagon search is
 * re-measured with real GPS distance to the pickup and ranked nearest →
 * farthest. Nothing here emits a socket, assigns a ride or takes a lock:
 * delivery stays on the existing `ride_dispatches` + Socket.IO room path and
 * acceptance stays on rideCore's atomic first-driver-wins claim.
 *
 * State source is the EXISTING `driverlocations` collection. Every valid GPS
 * update upserts the driver's current row there together with its `h3Cell`
 * (`recordDriverGps`), so a driver crossing a hexagon is discovered in the new
 * cell on the very next search — no manual refresh.
 *
 * Configuration (all optional, env-driven):
 *   H3_RESOLUTION        cell resolution (default 9)
 *   H3_MAX_RING          largest ring searched progressively (default 3)
 *   H3_MIN_CANDIDATES    stop expanding rings once this many eligible drivers exist (default 10)
 *   H3_MAX_CANDIDATES    hard cap on discovered candidates (default 40, mirrors legacy nearby limit)
 *   DRIVER_GPS_FRESH_MS  a GPS sample older than this never matches (default 5 min)
 *   RIDE_SEARCH_RADIUS_M candidates beyond it are dropped (default 5000)
 */
const { latLngToCell, gridRing, gridDisk } = require('h3-js');
const DriverLocation = require('../models/driverLocation.model');
const { haversineKm } = require('../utils/serviceArea');

const H3_RESOLUTION = Number(process.env.H3_RESOLUTION || 9);
const H3_MAX_RING = Number(process.env.H3_MAX_RING || 3);
const H3_MIN_CANDIDATES = Number(process.env.H3_MIN_CANDIDATES || 10);
const H3_MAX_CANDIDATES = Number(process.env.H3_MAX_CANDIDATES || 40);
const DRIVER_GPS_FRESH_MS = Number(process.env.DRIVER_GPS_FRESH_MS || 5 * 60 * 1000);
const RIDE_SEARCH_RADIUS_M = Number(process.env.RIDE_SEARCH_RADIUS_M || 5000);

/** Per-driver dispatch logs are dev-only noise control; production keeps the summary. */
const VERBOSE = process.env.NODE_ENV !== 'production';

function clampRing(value) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 0) return H3_MAX_RING;
    return n;
}

/**
 * H3 cell for a GPS position, or null for anything unusable.
 * @param {number} lat
 * @param {number} lng
 * @returns {string|null}
 */
function getDriverCell(lat, lng) {
    /** `Number(null) === 0` would silently index (0,0) — reject nullish/blank outright. */
    if (lat == null || lng == null) return null;
    if (String(lat).trim() === '' || String(lng).trim() === '') return null;
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
    if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
    try {
        return latLngToCell(la, ln, H3_RESOLUTION);
    } catch {
        return null;
    }
}

/** Every cell within `ring` rings of the pickup cell (Ring 0 … ring), deduped. */
function getNearbyCells(lat, lng, ring = H3_MAX_RING) {
    const cell = getDriverCell(lat, lng);
    if (!cell) return [];
    try {
        return gridDisk(cell, clampRing(ring));
    } catch {
        return [];
    }
}

/** Exactly one ring around `cell` (Ring 0 = the cell itself). */
function getRingCells(cell, ring) {
    if (!cell) return [];
    if (clampRing(ring) === 0) return [cell];
    try {
        return gridRing(cell, clampRing(ring));
    } catch {
        return [];
    }
}

/**
 * Upsert the driver's CURRENT position row in the existing `driverlocations`
 * collection, together with its H3 cell. Called for every valid GPS sample
 * (socket join + location tick) so the ring index never goes stale.
 *
 * The filter requires an existing `h3Cell`, which can never match one of the
 * append-only analytics samples — the current row stays one-per-driver and a
 * driver moving to a new hexagon updates that row in place.
 *
 * `recordedAt` is stamped with SERVER time (`timestamp` is accepted but never
 * trusted) so freshness cannot be spoofed by the client. A failure here is
 * thrown to the caller (callers log it) — GPS capture must never silently vanish.
 *
 * @returns {Promise<object|null>} the stored row, or null when the position is unusable.
 */
async function recordDriverGps({ driverId, lat, lng, heading, speed, accuracy, timestamp } = {}) {
    const id = driverId == null ? '' : String(driverId);
    const la = Number(lat);
    const ln = Number(lng);
    const h3Cell = getDriverCell(la, ln);
    if (!id || !h3Cell) return null;

    const $set = {
        driverId: id,
        coordinates: { type: 'Point', coordinates: [ln, la] },
        h3Cell,
        recordedAt: new Date(),
    };
    const h = Number(heading);
    if (heading != null && Number.isFinite(h) && h >= 0 && h <= 360) $set.heading = h;
    const s = Number(speed);
    if (speed != null && Number.isFinite(s) && s >= 0) $set.speed = s;
    const a = Number(accuracy);
    if (accuracy != null && Number.isFinite(a) && a >= 0) $set.accuracy = a;

    return DriverLocation.findOneAndUpdate(
        { driverId: id, h3Cell: { $exists: true } },
        { $set },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );
}

/**
 * Freshly-located driver ids inside the given cells. Stale samples (older than
 * `freshWithinMs`) are excluded by the query itself — a stale driver is simply
 * not a candidate; nothing is ever deleted.
 */
async function getFreshDriverIdsInCells(cells, freshWithinMs = DRIVER_GPS_FRESH_MS) {
    if (!Array.isArray(cells) || cells.length === 0) return [];
    const ids = await DriverLocation.distinct('driverId', {
        h3Cell: { $in: cells },
        recordedAt: { $gte: new Date(Date.now() - Math.max(1000, Number(freshWithinMs) || DRIVER_GPS_FRESH_MS)) },
    });
    return [...new Set((ids || []).map(String).filter(Boolean))];
}

/**
 * Real GPS distance from the pickup to each candidate — the ONLY ranking used.
 * H3 cells are never converted into a distance. Candidates with unusable or
 * unset coordinates, or beyond the ride search radius, are dropped.
 */
function rankByGpsDistance(docs, pickupLat, pickupLng) {
    const ranked = [];
    for (const d of docs || []) {
        const coords = d?.location?.coordinates;
        const dLng = Array.isArray(coords) ? Number(coords[0]) : NaN;
        const dLat = Array.isArray(coords) ? Number(coords[1]) : NaN;
        if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) continue;
        /** Registration default [0,0] is never a real position. */
        if (Math.abs(dLat) < 1e-5 && Math.abs(dLng) < 1e-5) continue;
        const distanceKm = haversineKm(pickupLat, pickupLng, dLat, dLng);
        if (!Number.isFinite(distanceKm)) continue;
        if (distanceKm * 1000 > RIDE_SEARCH_RADIUS_M) continue;
        const { _id } = d;
        ranked.push({ ...d, _id, distanceKm: Math.round(distanceKm * 1000) / 1000 });
    }
    return ranked.sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Progressive Ring 0 → maxRing candidate discovery around a ride pickup.
 *
 * Each ring asks `driverlocations` which FRESH drivers sit in that ring's cells,
 * hands those ids to `isEligible` (the ride's existing eligibility filters —
 * online, available, vehicle, city, account, not busy) and ranks the survivors
 * by real GPS distance. Rings stop as soon as `minCandidates` eligible drivers
 * exist, so a populated Ring 0 never triggers a wider search.
 *
 * @param {object} opts
 * @param {number} opts.pickupLat
 * @param {number} opts.pickupLng
 * @param {string|object} [opts.rideId] - log correlation only
 * @param {(ids: string[]) => Promise<object[]>} opts.isEligible
 *        Applies the existing eligibility filters to one ring's driver ids and
 *        returns the surviving captain docs (must expose `_id` and `location`).
 * @param {number} [opts.maxRing]
 * @param {number} [opts.minCandidates]
 * @param {number} [opts.freshWithinMs]
 * @returns {Promise<{pickupCell: string|null, ringUsed: number|null, candidates: object[]}>}
 *          candidates sorted nearest → farthest by actual GPS distance.
 */
async function getCandidateDrivers({
    pickupLat,
    pickupLng,
    rideId = '',
    isEligible,
    maxRing = H3_MAX_RING,
    minCandidates = H3_MIN_CANDIDATES,
    freshWithinMs = DRIVER_GPS_FRESH_MS,
} = {}) {
    const pickupCell = getDriverCell(pickupLat, pickupLng);
    if (!pickupCell) return { pickupCell: null, ringUsed: null, candidates: [] };

    const limit = clampRing(maxRing);
    const stopAt = Math.max(1, Math.floor(Number(minCandidates) || H3_MIN_CANDIDATES));
    const seen = new Set();
    const candidates = [];
    let ringUsed = 0;

    for (let ring = 0; ring <= limit; ring++) {
        const cells = getRingCells(pickupCell, ring);
        const freshIds = (await getFreshDriverIdsInCells(cells, freshWithinMs)).filter(
            (id) => !seen.has(id),
        );
        freshIds.forEach((id) => seen.add(id));

        let eligibleDocs = [];
        if (freshIds.length && typeof isEligible === 'function') {
            eligibleDocs = (await isEligible(freshIds)) || [];
        }
        const ranked = rankByGpsDistance(eligibleDocs, pickupLat, pickupLng);
        candidates.push(...ranked);
        ringUsed = ring;

        console.log('[H3 MATCH]', {
            rideId: rideId != null ? String(rideId) : '',
            pickupCell,
            ring,
            freshDriverCount: freshIds.length,
            candidateCount: ranked.length,
            totalSoFar: candidates.length,
        });

        if (candidates.length >= stopAt) break;
    }

    const final = candidates.slice(0, H3_MAX_CANDIDATES);
    if (VERBOSE) {
        for (const c of final) {
            console.log('[DRIVER RANK]', {
                captainId: String(c._id),
                distanceKm: c.distanceKm,
            });
        }
    }
    return { pickupCell, ringUsed, candidates: final };
}

module.exports = {
    H3_RESOLUTION,
    H3_MAX_RING,
    H3_MIN_CANDIDATES,
    H3_MAX_CANDIDATES,
    DRIVER_GPS_FRESH_MS,
    RIDE_SEARCH_RADIUS_M,
    getDriverCell,
    getNearbyCells,
    getRingCells,
    recordDriverGps,
    getFreshDriverIdsInCells,
    getCandidateDrivers,
};
