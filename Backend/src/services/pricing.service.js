const Service = require('../models/service.model');
const Pricing = require('../models/pricing.model'); // legacy — read once for migration
const FareConfiguration = require('../models/fare_configurations.model');
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

const DEFAULT_CAPTAIN_PRICING = {
    registrationFee: 1,
    minimumWalletBalance: 1,
    platformFee: 0,
};

const DRIVER_PLAN_TIERS = ['BIKE', 'AUTO', 'CAR'];

function mergeDriverPlansStored(stored) {
    const out = JSON.parse(JSON.stringify(DEFAULT_DRIVER_PLANS));

    for (const [vt, tiers] of Object.entries(stored || {})) {
        if (['MINI', 'SEDAN'].includes(vt)) continue;

        if (
            tiers &&
            typeof tiers === 'object' &&
            DRIVER_PLAN_TIERS.includes(vt)
        ) {
            out[vt] = { ...out[vt], ...tiers };
        }
    }

    return out;
}

/**
 * Ensure singleton `services` document.
 * Migrates from legacy `pricings` collection if necessary.
 */
async function ensureServiceDoc() {
    let doc = await Service.findOne({ key: 'global' });

    if (!doc) {
        const legacy = await Pricing.findOne({ key: 'global' }).lean();

        const rates =
            legacy?.rates &&
            typeof legacy.rates === 'object' &&
            Object.keys(legacy.rates).length
                ? { ...DEFAULT_RATES, ...legacy.rates }
                : { ...DEFAULT_RATES };

        const driverPlans = mergeDriverPlansStored(legacy?.driverPlans);

        doc = await Service.create({
            key: 'global',
            rates,
            driverPlans,
            captainPricing: { ...DEFAULT_CAPTAIN_PRICING },
            serviceAreas: [...SERVICE_AREAS],
            commissionPercent: Number(
                process.env.COMMISSION_PERCENT || 15,
            ),
            launchTrialDays: getLaunchTrialDays(),
        });
    }

    const $set = {};

    if (
        !doc.serviceAreas ||
        !Array.isArray(doc.serviceAreas) ||
        doc.serviceAreas.length === 0
    ) {
        $set.serviceAreas = [...SERVICE_AREAS];
    }

    if (
        doc.commissionPercent == null ||
        !Number.isFinite(Number(doc.commissionPercent))
    ) {
        $set.commissionPercent = Number(
            process.env.COMMISSION_PERCENT || 15,
        );
    }

    if (
        doc.launchTrialDays == null ||
        !Number.isFinite(Number(doc.launchTrialDays))
    ) {
        $set.launchTrialDays = getLaunchTrialDays();
    }

    if (!doc.rates || Object.keys(doc.rates || {}).length === 0) {
        $set.rates = { ...DEFAULT_RATES };
    }

    const dp = doc.driverPlans;

    if (
        !dp ||
        typeof dp !== 'object' ||
        Object.keys(dp).length === 0
    ) {
        $set.driverPlans = { ...DEFAULT_DRIVER_PLANS };
    }

    if (
        !doc.captainPricing ||
        typeof doc.captainPricing !== 'object'
    ) {
        $set.captainPricing = { ...DEFAULT_CAPTAIN_PRICING };
    } else {
        const captainPricing = doc.captainPricing.toObject
            ? doc.captainPricing.toObject()
            : doc.captainPricing;

        const currentCaptainPricing = {
            registrationFee: Number(
                captainPricing.registrationFee ??
                    DEFAULT_CAPTAIN_PRICING.registrationFee,
            ),
            minimumWalletBalance: Number(
                captainPricing.minimumWalletBalance ??
                    DEFAULT_CAPTAIN_PRICING.minimumWalletBalance,
            ),
            platformFee: Number(
                captainPricing.platformFee ??
                    DEFAULT_CAPTAIN_PRICING.platformFee,
            ),
        };

        $set.captainPricing = currentCaptainPricing;
    }

    if (Object.keys($set).length) {
        doc = await Service.findOneAndUpdate(
            { key: 'global' },
            { $set },
            { new: true },
        );
    }

    return doc;
}

async function getCommissionPercent() {
    const doc = await ensureServiceDoc();
    const n = Number(doc.commissionPercent);

    if (Number.isFinite(n) && n >= 0 && n <= 100) {
        return n;
    }

    return Number(process.env.COMMISSION_PERCENT || 15);
}

async function getEffectiveLaunchTrialDays() {
    const doc = await ensureServiceDoc();

    if (doc.launchTrialDays != null) {
        const n = Number(doc.launchTrialDays);

        if (Number.isFinite(n) && n >= 0) {
            return Math.min(Math.floor(n), 365);
        }
    }

    return getLaunchTrialDays();
}

async function getServiceAreas() {
    const doc = await ensureServiceDoc();

    if (
        Array.isArray(doc.serviceAreas) &&
        doc.serviceAreas.length > 0
    ) {
        return doc.serviceAreas.map((a) =>
            a && typeof a.toObject === 'function'
                ? a.toObject()
                : { ...a },
        );
    }

    return [...SERVICE_AREAS];
}

async function getRates(cityZone = null) {
    const zone = cityZone ? String(cityZone).trim() : null;
    const now = new Date();

    const vehicleTypes = ['BIKE', 'AUTO', 'CAR'];
    const out = {};
    let hasActiveConfig = false;

    const extractRatesFromDoc = (cfg, vt) => {
        const baseFare = Number(cfg.baseFare != null ? cfg.baseFare : (cfg.rates?.[vt]?.baseFare ?? 0));
        const perKm = Number(cfg.distanceRate != null ? cfg.distanceRate : (cfg.rates?.[vt]?.perKm ?? 0));
        const platformFee = Number(cfg.fees != null ? cfg.fees : (cfg.rates?.[vt]?.platformFee ?? 0));
        const timeRate = Number(cfg.timeRate || 0);
        const minimumFare = Number(cfg.minimumFare || 0);
        const tax = Number(cfg.tax || 0);
        const version = cfg.version != null ? cfg.version : 1;

        return {
            baseFare,
            perKm,
            distanceRate: perKm,
            platformFee,
            fees: platformFee,
            timeRate,
            minimumFare,
            tax,
            version,
            rideType: vt,
            cityZone: cfg.cityZone || zone,
            status: cfg.status || 'ACTIVE',
        };
    };

    /**
     * Step 1: If cityZone provided, find active fare_configurations for this specific city zone.
     * Case-insensitive match on cityZone and rideType.
     * Latest version wins.
     */
    if (zone) {
        const zoneRegex = new RegExp(`^${zone}$`, 'i');
        const configs = await FareConfiguration.find({
            cityZone: zoneRegex,
            status: 'ACTIVE',
            effectiveFrom: { $lte: now },
            $or: [
                { effectiveTo: null },
                { effectiveTo: { $gte: now } }
            ]
        })
            .sort({ version: -1, updatedAt: -1 })
            .lean();

        for (const vt of vehicleTypes) {
            const cfg = configs.find(
                (item) => String(item.rideType || '').toUpperCase() === vt
            );
            if (cfg) {
                out[vt] = extractRatesFromDoc(cfg, vt);
                hasActiveConfig = true;
            }
        }
    }

    /**
     * Step 2: For any vehicle types not found for this cityZone (or if no cityZone provided),
     * check active fare_configurations in the database (latest version wins).
     */
    for (const vt of vehicleTypes) {
        if (out[vt]) continue;

        const cfg = await FareConfiguration.findOne({
            rideType: new RegExp(`^${vt}$`, 'i'),
            status: 'ACTIVE',
            effectiveFrom: { $lte: now },
            $or: [
                { effectiveTo: null },
                { effectiveTo: { $gte: now } }
            ]
        })
            .sort({ version: -1, updatedAt: -1 })
            .lean();

        if (cfg) {
            out[vt] = extractRatesFromDoc(cfg, vt);
            hasActiveConfig = true;
        }
    }

    /**
     * Step 3: Emergency fallback ONLY when NO active fare_configurations record exists in the DB.
     * Legacy services.rates must NOT override active fare_configurations.
     */
    if (!hasActiveConfig || Object.keys(out).length < 3) {
        const legacy = await ensureServiceDoc();
        const stored = legacy?.rates || {};

        for (const vt of vehicleTypes) {
            if (out[vt]) continue;

            const cfg = stored[vt] || DEFAULT_RATES[vt];

            out[vt] = {
                baseFare: Number(cfg.baseFare || 0),
                perKm: Number(cfg.perKm || 0),
                distanceRate: Number(cfg.perKm || 0),
                platformFee: Number(cfg.platformFee || 0),
                fees: Number(cfg.platformFee || 0),
                timeRate: Number(cfg.timeRate || 0),
                minimumFare: Number(cfg.minimumFare || 0),
                tax: Number(cfg.tax || 0),
                version: 0,
            };
        }
        if (!hasActiveConfig) {
            console.log(
                '[Fare Fallback] No active fare_configurations found. Using legacy services.rates.'
            );
        }
    }

    return out;
}

async function getCaptainPricing() {
    const doc = await ensureServiceDoc();
    const stored = doc.captainPricing || {};

    return {
        registrationFee: Number(
            stored.registrationFee ??
                DEFAULT_CAPTAIN_PRICING.registrationFee,
        ),
        minimumWalletBalance: Number(
            stored.minimumWalletBalance ??
                DEFAULT_CAPTAIN_PRICING.minimumWalletBalance,
        ),
        platformFee: Number(
            stored.platformFee ??
                DEFAULT_CAPTAIN_PRICING.platformFee,
        ),
    };
}

async function updateCaptainPricing(partial) {
    await ensureServiceDoc();

    const current = await getCaptainPricing();

    const next = {
        ...DEFAULT_CAPTAIN_PRICING,
        ...current,
    };

    if (
        partial &&
        partial.registrationFee != null
    ) {
        const value = Number(partial.registrationFee);

        if (!Number.isFinite(value) || value < 0) {
            throw new Error(
                'registrationFee must be a valid non-negative number',
            );
        }

        next.registrationFee = value;
    }

    if (
        partial &&
        partial.minimumWalletBalance != null
    ) {
        const value = Number(partial.minimumWalletBalance);

        if (!Number.isFinite(value) || value < 0) {
            throw new Error(
                'minimumWalletBalance must be a valid non-negative number',
            );
        }

        next.minimumWalletBalance = value;
    }

    if (
        partial &&
        partial.platformFee != null
    ) {
        const value = Number(partial.platformFee);

        if (!Number.isFinite(value) || value < 0) {
            throw new Error(
                'platformFee must be a valid non-negative number',
            );
        }

        next.platformFee = value;
    }

    return Service.findOneAndUpdate(
        { key: 'global' },
        { $set: { captainPricing: next } },
        { new: true, upsert: true },
    );
}

async function getDriverPlansMerged() {
    const doc = await ensureServiceDoc();
    const merged = mergeDriverPlansStored(doc.driverPlans);
    const out = {};

    for (const k of DRIVER_PLAN_TIERS) {
        out[k] = merged[k];
    }

    return out;
}

async function updateRates(partial) {
    const zone = String(
        partial?.cityZone ||
        process.env.FARE_CITY_ZONE ||
        'pune'
    ).trim().toLowerCase();

    const vehicleTypes = ['BIKE', 'AUTO', 'CAR'];

    const results = {};

    for (const vt of vehicleTypes) {
        const requested = partial?.[vt];

        if (!requested || typeof requested !== 'object') {
            continue;
        }

        const now = new Date();

        /*
         * Find the latest ACTIVE configuration to determine next version
         * and merge with existing fields.
         */
        const previous = await FareConfiguration.findOne({
            rideType: new RegExp(`^${vt}$`, 'i'),
            cityZone: new RegExp(`^${zone}$`, 'i'),
            status: 'ACTIVE'
        })
            .sort({ version: -1 })
            .lean();

        const version = Number(previous?.version || 0) + 1;

        /*
         * Close the currently active configuration.
         */
        await FareConfiguration.updateMany(
            {
                rideType: new RegExp(`^${vt}$`, 'i'),
                cityZone: new RegExp(`^${zone}$`, 'i'),
                status: 'ACTIVE'
            },
            {
                $set: {
                    status: 'INACTIVE',
                    effectiveTo: now
                }
            }
        );

        /*
         * Create the new live configuration.
         *
         * Existing Admin pricing fields are mapped as:
         * baseFare     -> baseFare
         * perKm        -> distanceRate
         * platformFee  -> fees
         */
        const merged = {
            baseFare: requested.baseFare ?? previous?.baseFare ?? 0,
            distanceRate: requested.perKm ?? requested.distanceRate ?? previous?.distanceRate ?? 0,
            timeRate: requested.perMin ?? requested.timeRate ?? previous?.timeRate ?? 0,
            minimumFare: requested.minimumFare ?? requested.minFare ?? previous?.minimumFare ?? 0,
            fees: requested.platformFee ?? requested.fees ?? previous?.fees ?? 0,
            tax: requested.tax ?? previous?.tax ?? 0,
            registrationFee: requested.registrationFee ?? previous?.registrationFee ?? 0,
            minimumWalletBalance: requested.minimumWalletBalance ?? previous?.minimumWalletBalance ?? 0,
        };

        const created = await FareConfiguration.create({
            rideType: vt,
            cityZone: partial?.cityZone || previous?.cityZone || 'Kolhapur',
            version,
            status: 'ACTIVE',
            effectiveFrom: now,
            effectiveTo: null,
            baseFare: Number(merged.baseFare),
            distanceRate: Number(merged.distanceRate),
            timeRate: Number(merged.timeRate),
            minimumFare: Number(merged.minimumFare),
            fees: Number(merged.fees),
            tax: Number(merged.tax),
            registrationFee: Number(merged.registrationFee),
            minimumWalletBalance: Number(merged.minimumWalletBalance),
            rates: {
                [vt]: {
                    baseFare: Number(merged.baseFare),
                    perKm: Number(merged.distanceRate),
                    platformFee: Number(merged.fees),
                },
            },
        });

        results[vt] = created.toObject();
    }

    /*
     * Keep the old services document synchronized for
     * legacy Admin screens/API consumers.
     */
    try {
        await ensureServiceDoc();

        const current = await getRates(zone);
        const legacyRates = {};

        for (const vt of vehicleTypes) {
            const cfg = current[vt];

            if (!cfg) continue;

            legacyRates[vt] = {
                baseFare: Number(cfg.baseFare || 0),
                perKm: Number(cfg.perKm || 0),
                platformFee: Number(cfg.platformFee || 0)
            };
        }

        await Service.findOneAndUpdate(
            { key: 'global' },
            { $set: { rates: legacyRates } },
            { new: true, upsert: true }
        );
    } catch (legacyError) {
        console.warn(
            '[pricing] legacy services sync warning:',
            legacyError?.message || legacyError
        );
    }

    return {
        rates: await getRates(zone),
        fareConfigurations: results,
        cityZone: zone
    };
}

async function updateDriverPlans(partial) {
    const merged = await getDriverPlansMerged();
    const next = { ...merged };

    for (const vt of Object.keys(partial || {})) {
        if (!DRIVER_PLAN_TIERS.includes(vt)) continue;

        const p = partial[vt];

        if (
            p &&
            typeof p === 'object' &&
            next[vt]
        ) {
            next[vt] = {
                ...next[vt],
                ...p,
            };
        }
    }

    return Service.findOneAndUpdate(
        { key: 'global' },
        { $set: { driverPlans: next } },
        { new: true, upsert: true },
    );
}

async function updateServiceMeta(partial) {
    await ensureServiceDoc();

    const $set = {};

    if (
        partial &&
        typeof partial.commissionPercent === 'number'
    ) {
        const c = Math.min(
            100,
            Math.max(0, Math.round(partial.commissionPercent)),
        );

        $set.commissionPercent = c;
    }

    if (
        partial &&
        Array.isArray(partial.serviceAreas) &&
        partial.serviceAreas.length > 0
    ) {
        $set.serviceAreas = partial.serviceAreas
            .map((a) => ({
                key: String(a.key || '').trim(),
                name: String(a.name || '').trim(),
                lat: Number(a.lat),
                lng: Number(a.lng),
                radius: Number(a.radius),
            }))
            .filter(
                (a) =>
                    a.key &&
                    Number.isFinite(a.lat) &&
                    Number.isFinite(a.lng) &&
                    Number.isFinite(a.radius) &&
                    a.radius > 0,
            );
    }

    if (
        partial &&
        partial.launchTrialDays != null
    ) {
        const n = Math.min(
            365,
            Math.max(
                0,
                Math.floor(Number(partial.launchTrialDays)),
            ),
        );

        if (Number.isFinite(n)) {
            $set.launchTrialDays = n;
        }
    }

    if (Object.keys($set).length === 0) {
        return Service.findOne({ key: 'global' });
    }

    return Service.findOneAndUpdate(
        { key: 'global' },
        { $set },
        { new: true },
    );
}

module.exports = {
    DEFAULT_RATES,
    DEFAULT_DRIVER_PLANS,
    DEFAULT_CAPTAIN_PRICING,
    ensureServiceDoc,
    getRates,
    updateRates,
    getCaptainPricing,
    updateCaptainPricing,
    getDriverPlansMerged,
    updateDriverPlans,
    getCommissionPercent,
    getEffectiveLaunchTrialDays,
    getServiceAreas,
    updateServiceMeta,
};