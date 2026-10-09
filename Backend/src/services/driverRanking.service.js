/**
 * ETA-based driver ranking (§2.C) — runs AFTER H3 candidate discovery.
 *
 * H3 + GPS distance answer "who is nearby, nearest first". This service
 * refines the TOP of that list with the one signal that actually matters for
 * pickup: real road-network time from the driver to the pickup, from the
 * EXISTING routing provider (maps.service.getDrivingRoute → OSRM).
 *
 * Contract:
 *   1. Candidates arrive sorted nearest → farthest by straight-line distance
 *      (driverHex / $near order). Never re-sorted by a fabricated ETA.
 *   2. Only the nearest `ETA_SHORTLIST_SIZE` candidates are sent to the
 *      router (bounded provider quota). The rest keep their distance rank.
 *   3. Shortlist members with a road ETA are ordered by ETA ascending, but
 *      only WITHIN the shortlist slots they already occupy: a shortlisted
 *      driver whose route lookup failed keeps its distance-based position
 *      (distance fallback — straight-line is NEVER presented as a driving ETA,
 *      so a failed lookup simply yields no reordering for that driver).
 *   4. Provider failure handling: per-call timeout, an in-memory TTL cache so
 *      repeated dispatches/waves for the same driver+ pickup do not re-bill
 *      the router, and a circuit breaker — when a whole round fails the
 *      provider is skipped for `ETA_FAILURE_COOLDOWN_MS` and ranking is pure
 *      distance until it recovers.
 *
 * Configuration (env, read at call time — same pattern as rideExpiry.searchWindowSec):
 *   ETA_SHORTLIST_SIZE     nearest candidates sent to the router (default 5, 0 disables)
 *   ETA_ROAD_TIMEOUT_MS    per-call router timeout (default 1500)
 *   ETA_CACHE_TTL_MS       road-ETA cache entry lifetime (default 60000)
 *   ETA_FAILURE_COOLDOWN_MS  circuit-open window after an all-fail round (default 30000)
 *
 * Logs: one concise `[ETA RANK]` summary per ranking (rideId, counts,
 * etaSource, ms) and, in dev only, a per-driver `[DRIVER ETA]` line.
 * Never logs secrets or raw coordinates.
 */
const mapService = require('./maps.service');
const { haversineKm } = require('../utils/serviceArea');

/** Cache max kept as a constant (not env) — bounding router quota does not need tuning. */
const ETA_CACHE_MAX = 400;
const etaCache = new Map(); // key -> { etaSec, distanceMeters, at } (insertion order = recency)

/** Circuit state: open until this timestamp after an all-fail round. */
let circuitOpenUntil = 0;

/** Dev-only per-driver lines (same rule as driverHex VERBOSE). */
const VERBOSE = process.env.NODE_ENV !== 'production';

function envNumber(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const raw = Number(process.env[name]);
    if (!Number.isFinite(raw) || raw < min) return fallback;
    return Math.min(raw, max);
}

function shortlistSize() {
    return envNumber('ETA_SHORTLIST_SIZE', 5, { max: 50 });
}

function roadTimeoutMs() {
    return envNumber('ETA_ROAD_TIMEOUT_MS', 1500, { min: 100, max: 10000 });
}

function cacheTtlMs() {
    return envNumber('ETA_CACHE_TTL_MS', 60000, { min: 1000 });
}

function failureCooldownMs() {
    return envNumber('ETA_FAILURE_COOLDOWN_MS', 30000, { min: 1000 });
}

/** Test/ops helper — clears cache + circuit so verification runs are deterministic. */
function resetRankingState() {
    etaCache.clear();
    circuitOpenUntil = 0;
}

function circuitOpen(now = Date.now()) {
    return now < circuitOpenUntil;
}

function openCircuit() {
    circuitOpenUntil = Date.now() + failureCooldownMs();
}

function cacheKey(driverId, pickupLat, pickupLng) {
    /**
     * Keyed by driver + pickup only (NOT the driver's exact position): within
     * the TTL a driver's movement barely changes pickup ETA, and this keeps
     * repeated waves/re-dispatch for the same ride router-quotas friendly.
     */
    return `${driverId}|${Number(pickupLat).toFixed(3)},${Number(pickupLng).toFixed(3)}`;
}

function cacheGet(key) {
    const hit = etaCache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > cacheTtlMs()) {
        etaCache.delete(key);
        return null;
    }
    /* Refresh recency for LRU-style eviction. */
    etaCache.delete(key);
    etaCache.set(key, hit);
    return hit;
}

function cacheSet(key, value) {
    if (etaCache.size >= ETA_CACHE_MAX) {
        /* Evict the oldest ~25% (Map preserves insertion order). */
        let drop = Math.ceil(ETA_CACHE_MAX / 4);
        for (const k of etaCache.keys()) {
            etaCache.delete(k);
            if (--drop <= 0) break;
        }
    }
    etaCache.set(key, value);
}

/** Usable [lng, lat] on a candidate doc, or null. Rejects [0,0] registration defaults. */
function coordsOf(candidate) {
    const c = candidate?.location?.coordinates;
    if (!Array.isArray(c) || c.length < 2) return null;
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) < 1e-5 && Math.abs(lng) < 1e-5) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
}

/**
 * Road ETA for ONE candidate, honoring cache + timeout.
 * @returns {Promise<number|null>} eta seconds, or null (unusable / failed).
 *   `failed` in the second slot tells the caller whether a real router call
 *   was attempted and failed (circuit accounting) vs never attempted.
 */
async function roadEtaSeconds(candidate, pickupLat, pickupLng, { driverId, timeoutMs }) {
    const pt = coordsOf(candidate);
    if (!pt) return { etaSec: null, attempted: false, ok: false };

    const key = cacheKey(driverId, pickupLat, pickupLng);
    const hit = cacheGet(key);
    if (hit) return { etaSec: hit.etaSec, attempted: false, ok: true };

    if (typeof mapService.getDrivingRoute !== 'function') {
        return { etaSec: null, attempted: false, ok: false };
    }

    let timer = null;
    try {
        const call = mapService.getDrivingRoute(pt.lng, pt.lat, pickupLng, pickupLat, {
            overview: 'false',
            timeoutMs: timeoutMs,
        });
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`eta road timeout after ${timeoutMs}ms`)),
                timeoutMs,
            );
        });
        const route = await Promise.race([call, timeout]);
        const etaSec = Number(route?.durationSec);
        if (!Number.isFinite(etaSec) || etaSec <= 0) {
            return { etaSec: null, attempted: true, ok: false };
        }
        cacheSet(key, {
            etaSec,
            distanceMeters: Number(route?.distanceMeters) || null,
            at: Date.now(),
        });
        return { etaSec, attempted: true, ok: true };
    } catch {
        /* Timeout / provider error / no route — caller falls back to distance. */
        return { etaSec: null, attempted: true, ok: false };
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function distanceKmOf(candidate, pickupLat, pickupLng) {
    if (Number.isFinite(candidate?.distanceKm)) return candidate.distanceKm;
    const pt = coordsOf(candidate);
    if (!pt) return null;
    const km = haversineKm(pickupLat, pickupLng, pt.lat, pt.lng);
    return Number.isFinite(km) ? Math.round(km * 1000) / 1000 : null;
}

/**
 * Refine a distance-ordered candidate list with road ETA for the shortlist.
 *
 * @param {object[]} candidates  nearest → farthest by straight-line distance
 * @param {object} opts
 * @param {number} opts.pickupLat
 * @param {number} opts.pickupLng
 * @param {string|object} [opts.rideId]  log correlation only
 * @returns {Promise<object[]>} same docs, shortlist re-ordered by road ETA;
 *   everything else keeps its distance rank. Input array is never mutated.
 */
async function rankCandidates(candidates, { pickupLat, pickupLng, rideId = '' } = {}) {
    if (!Array.isArray(candidates) || candidates.length < 2) return candidates || [];
    if (!Number.isFinite(Number(pickupLat)) || !Number.isFinite(Number(pickupLng))) {
        return candidates;
    }
    const K = shortlistSize();
    if (K <= 0) return candidates;

    const rid = rideId != null ? String(rideId) : '';
    const started = Date.now();

    if (circuitOpen()) {
        console.log('[ETA RANK]', {
            rideId: rid,
            shortlist: 0,
            roadOk: 0,
            roadFailed: 0,
            etaSource: 'distance',
            note: 'provider circuit open — distance fallback',
        });
        return candidates;
    }

    const shortlist = candidates.slice(0, K);
    const rest = candidates.slice(K);
    const timeoutMs = roadTimeoutMs();

    const results = await Promise.all(
        shortlist.map((c) =>
            roadEtaSeconds(c, pickupLat, pickupLng, {
                driverId: String(c?._id ?? ''),
                timeoutMs,
            }),
        ),
    );

    const roadOk = results.filter((r) => r.etaSec != null).length;
    const attempted = results.filter((r) => r.attempted).length;
    const attemptedFailures = results.filter((r) => r.attempted && !r.ok).length;

    /*
     * Circuit breaker: a round where EVERY attempted router call failed means
     * the provider (not a single driver) is down — skip it for a while.
     * A single driver with "no route" while others succeed is not a provider
     * failure and must not open the circuit.
     */
    if (attempted > 0 && roadOk === 0) {
        openCircuit();
    }

    /* Known-ETA shortlist members fill the slots held by known-ETA members,
       ordered by ETA; failed lookups keep their distance-based slots. */
    const slots = [];
    const entries = [];
    results.forEach((r, i) => {
        if (r.etaSec != null) {
            slots.push(i);
            entries.push({ index: i, etaSec: r.etaSec });
        }
    });
    entries.sort((a, b) => a.etaSec - b.etaSec);

    const orderedShortlist = [...shortlist];
    slots.forEach((slot, j) => {
        orderedShortlist[slot] = shortlist[entries[j].index];
    });

    const etaSource = roadOk > 0 ? 'road' : 'distance';
    console.log('[ETA RANK]', {
        rideId: rid,
        shortlist: shortlist.length,
        roadOk,
        /** Real router calls that failed (never counted: cached, unusable coords, provider disabled). */
        roadFailed: attemptedFailures,
        etaSource,
        ms: Date.now() - started,
    });

    if (VERBOSE) {
        const etaById = new Map();
        results.forEach((r, i) => {
            if (r.etaSec != null) etaById.set(String(shortlist[i]?._id), r.etaSec);
        });
        for (const c of orderedShortlist) {
            const km = distanceKmOf(c, pickupLat, pickupLng);
            const etaSec = etaById.get(String(c?._id)) ?? null;
            console.log('[DRIVER ETA]', {
                captainId: String(c?._id),
                distanceKm: km,
                etaSec,
                etaSource: etaSec != null ? 'road' : 'distance',
            });
        }
    }

    return [...orderedShortlist, ...rest];
}

module.exports = {
    rankCandidates,
    resetRankingState,
    /** Exposed for tests/ops diagnostics only. */
    _internal: { circuitOpen, cacheSize: () => etaCache.size },
};
