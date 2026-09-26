const Service = require('../models/service.model');
const Pricing = require('../models/pricing.model'); // legacy — read once for migration
const { SERVICE_AREAS } = require('../config/serviceAreas');
const { getLaunchTrialDays } = require('../config/env');

const DEFAULT_RATES = {
    BIKE: { baseFare: 15, perKm: 8, platformFee: 5 },
    AUTO: { baseFare: 25, perKm: 11, platformFee: 5 },
    CAR: { baseFare: 40, perKm: 12, platformFee: 10 },
};

const DEFAULT_DRIVER_PLANS = {
    BIKE: { weekly: 29, monthly: 99, yearly: 899 },
    AUTO: { weekly: 39, monthly: 149, yearly: 1199 },
    CAR: { weekly: 59, monthly: 199, yearly: 1599 },
};

const DRIVER_PLAN_TIERS = [ 'BIKE', 'AUTO', 'CAR' ];

function mergeDriverPlansStored (stored) {
    const out = JSON.parse(JSON.stringify(DEFAULT_DRIVER_PLANS));
    for (const [ vt, tiers ] of Object.entries(stored || {})) {
        if ([ 'MINI', 'SEDAN' ].includes(vt)) continue;
        if (tiers && typeof tiers === 'object' && DRIVER_PLAN_TIERS.includes(vt)) {
            out[vt] = { ...out[vt], ...tiers };
        }
    }
    return out;
}

/**
 * Ensure singleton `services` document; migrate from legacy `pricings` if present.
 */
async function ensureServiceDoc () {
    let doc = await Service.findOne({ key: 'global' });
    if (!doc) {
        const legacy = await Pricing.findOne({ key: 'global' }).lean();
        const rates = legacy?.rates && typeof legacy.rates === 'object' && Object.keys(legacy.rates).length
            ? { ...DEFAULT_RATES, ...legacy.rates }
            : { ...DEFAULT_RATES };
        const driverPlans = mergeDriverPlansStored(legacy?.driverPlans);
        doc = await Service.create({
            key: 'global',
            rates,
            driverPlans,
            serviceAreas: [ ...SERVICE_AREAS ],
            commissionPercent: Number(process.env.COMMISSION_PERCENT || 15),
            launchTrialDays: getLaunchTrialDays(),
        });
    }

    const $set = {};
    if (!doc.serviceAreas || !Array.isArray(doc.serviceAreas) || doc.serviceAreas.length === 0) {
        $set.serviceAreas = [ ...SERVICE_AREAS ];
    }
    if (doc.commissionPercent == null || !Number.isFinite(Number(doc.commissionPercent))) {
        $set.commissionPercent = Number(process.env.COMMISSION_PERCENT || 15);
    }
    if (doc.launchTrialDays == null || !Number.isFinite(Number(doc.launchTrialDays))) {
        $set.launchTrialDays = getLaunchTrialDays();
    }
    if (!doc.rates || Object.keys(doc.rates || {}).length === 0) {
        $set.rates = { ...DEFAULT_RATES };
    }
    const dp = doc.driverPlans;
    if (!dp || typeof dp !== 'object' || Object.keys(dp).length === 0) {
        $set.driverPlans = { ...DEFAULT_DRIVER_PLANS };
    }
    if (Object.keys($set).length) {
        doc = await Service.findOneAndUpdate({ key: 'global' }, { $set }, { new: true });
    }
    return doc;
}

async function getCommissionPercent () {
    const doc = await ensureServiceDoc();
    const n = Number(doc.commissionPercent);
    if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
    return Number(process.env.COMMISSION_PERCENT || 15);
}

/** Trial days: DB `launchTrialDays` when set; else env-based getter. */
async function getEffectiveLaunchTrialDays () {
    const doc = await ensureServiceDoc();
    if (doc.launchTrialDays != null) {
        const n = Number(doc.launchTrialDays);
        if (Number.isFinite(n) && n >= 0) return Math.min(Math.floor(n), 365);
    }
    return getLaunchTrialDays();
}

async function getServiceAreas () {
    const doc = await ensureServiceDoc();
    if (Array.isArray(doc.serviceAreas) && doc.serviceAreas.length > 0) {
        return doc.serviceAreas.map((a) => (a && typeof a.toObject === 'function' ? a.toObject() : { ...a }));
    }
    return [ ...SERVICE_AREAS ];
}

async function getRates () {
    const doc = await ensureServiceDoc();
    const stored = doc.rates || {};
    const out = {};
    for (const vt of Object.keys(DEFAULT_RATES)) {
        const cfg = stored?.[vt];
        out[vt] = {
            baseFare: Number(cfg?.baseFare ?? DEFAULT_RATES[vt].baseFare),
            perKm: Number(cfg?.perKm ?? DEFAULT_RATES[vt].perKm),
            platformFee: Number(cfg?.platformFee ?? DEFAULT_RATES[vt].platformFee),
        };
    }
    return out;
}

async function getDriverPlansMerged () {
    const doc = await ensureServiceDoc();
    const merged = mergeDriverPlansStored(doc.driverPlans);
    const out = {};
    for (const k of DRIVER_PLAN_TIERS) {
        out[k] = merged[k];
    }
    return out;
}

async function updateRates (partial) {
    await ensureServiceDoc();
    const current = await getRates();
    const next = { ...DEFAULT_RATES, ...current };
    for (const vt of Object.keys(partial || {})) {
        const p = partial[vt];
        if (p && typeof p === 'object' && next[vt]) {
            next[vt] = { ...next[vt], ...p };
        }
    }
    return Service.findOneAndUpdate(
        { key: 'global' },
        { $set: { rates: next } },
        { new: true, upsert: true },
    );
}

async function updateDriverPlans (partial) {
    const merged = await getDriverPlansMerged();
    const next = { ...merged };
    for (const vt of Object.keys(partial || {})) {
        if (!DRIVER_PLAN_TIERS.includes(vt)) continue;
        const p = partial[vt];
        if (p && typeof p === 'object' && next[vt]) {
            next[vt] = { ...next[vt], ...p };
        }
    }
    return Service.findOneAndUpdate(
        { key: 'global' },
        { $set: { driverPlans: next } },
        { new: true, upsert: true },
    );
}

async function updateServiceMeta (partial) {
    await ensureServiceDoc();
    const $set = {};
    if (partial && typeof partial.commissionPercent === 'number') {
        const c = Math.min(100, Math.max(0, Math.round(partial.commissionPercent)));
        $set.commissionPercent = c;
    }
    if (partial && Array.isArray(partial.serviceAreas) && partial.serviceAreas.length > 0) {
        $set.serviceAreas = partial.serviceAreas.map((a) => ({
            key: String(a.key || '').trim(),
            name: String(a.name || '').trim(),
            lat: Number(a.lat),
            lng: Number(a.lng),
            radius: Number(a.radius),
        })).filter((a) => a.key && Number.isFinite(a.lat) && Number.isFinite(a.lng) && Number.isFinite(a.radius) && a.radius > 0);
    }
    if (partial && partial.launchTrialDays != null) {
        const n = Math.min(365, Math.max(0, Math.floor(Number(partial.launchTrialDays))));
        if (Number.isFinite(n)) $set.launchTrialDays = n;
    }
    if (Object.keys($set).length === 0) return Service.findOne({ key: 'global' });
    return Service.findOneAndUpdate({ key: 'global' }, { $set }, { new: true });
}

module.exports = {
    DEFAULT_RATES,
    ensureServiceDoc,
    getRates,
    updateRates,
    getDriverPlansMerged,
    updateDriverPlans,
    getCommissionPercent,
    getEffectiveLaunchTrialDays,
    getServiceAreas,
    updateServiceMeta,
};
