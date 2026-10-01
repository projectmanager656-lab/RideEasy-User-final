const express = require('express');
const pricingService = require('../services/pricing.service');
const RideeasySupport = require('../models/rideeasySupport.model');
const { SERVICE_AREAS } = require('../config/serviceAreas');
const { getScheduledDispatchLeadMinutes } = require('../config/env');

const router = express.Router();

/**
 * Public scheduling rule for clients (no auth).
 *
 * There is no dispatch lead: a scheduled ride starts searching at exactly the
 * selected pickup instant (`dispatchAt === scheduledPickupAt`), so the picker
 * only has to keep the chosen time genuinely in the future. Published from the
 * same config source ride creation uses — one rule. (0 = no lead.)
 */
router.get('/scheduling', (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    return res.status(200).json({
        success: true,
        ok: true,
        scheduledDispatchLeadMinutes: getScheduledDispatchLeadMinutes(),
        message: 'Scheduling rules',
        requestId: req.requestId,
    });
});

/**
 * Public service-area config for clients (no auth).
 * Prefer this over duplicating zones in frontend bundles.
 */
router.get('/service-areas', async (req, res) => {
    try {
        const fromDb = await pricingService.getServiceAreas();
        const areas = Array.isArray(fromDb) && fromDb.length > 0 ? fromDb : SERVICE_AREAS;
        const cities = [ ...new Set(areas.map((a) => a.key).filter(Boolean)) ];
        res.set('Cache-Control', 'public, max-age=300');
        return res.status(200).json({
            success: true,
            ok: true,
            cities,
            areas: areas.map((z) => ({
                key: z.key,
                name: z.name,
                lat: z.lat,
                lng: z.lng,
                radiusKm: z.radius,
                tier: z.tier || null,
            })),
            message: 'Service areas',
            requestId: req.requestId,
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            ok: false,
            error: err?.message || 'Config failed',
            message: err?.message || 'Config failed',
            code: 'CONFIG_ERROR',
            requestId: req.requestId,
        });
    }
});

/**
 * Public fare config for clients (no auth). Same shape the
 * `fareConfigUpdated` socket event carries — the API is the source of
 * truth on startup/reconnect, socket events keep it fresh in between.
 */
router.get('/fare', async (req, res) => {
    try {
        const [rates, doc] = await Promise.all([
            pricingService.getRates(),
            pricingService.ensureServiceDoc(),
        ]);
        const version = doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null;
        res.set('Cache-Control', 'public, max-age=60');
        return res.status(200).json({
            success: true,
            ok: true,
            fareConfig: { version, rates },
            message: 'Fare config',
            requestId: req.requestId,
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            ok: false,
            error: err?.message || 'Config failed',
            message: err?.message || 'Config failed',
            code: 'CONFIG_ERROR',
            requestId: req.requestId,
        });
    }
});

/**
 * Public emergency-support config for clients (no auth — read-only).
 * Serves the active RideEasy Support record from the `rideeasy_support`
 * collection (managed in Atlas). Empty phone = not configured yet.
 */
router.get('/rideeasy-support', async (req, res) => {
    try {
        const doc = await RideeasySupport
            .findOne({ isActive: true, type: 'EMERGENCY_SUPPORT' })
            .sort({ priority: -1 })
            .lean();
        res.set('Cache-Control', 'public, max-age=300');
        return res.status(200).json({
            success: true,
            ok: true,
            rideeasySupport: doc
                ? {
                    name: doc.name || 'RideEasy Support',
                    phone: String(doc.phone || '').trim(),
                    description: doc.description || '',
                    isActive: Boolean(doc.isActive),
                    version: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
                }
                : null,
            message: 'RideEasy Support',
            requestId: req.requestId,
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            ok: false,
            error: err?.message || 'Config failed',
            message: err?.message || 'Config failed',
            code: 'CONFIG_ERROR',
            requestId: req.requestId,
        });
    }
});

module.exports = router;
