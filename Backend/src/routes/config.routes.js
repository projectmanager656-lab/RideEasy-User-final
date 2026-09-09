const express = require('express');
const pricingService = require('../services/pricing.service');
const { SERVICE_AREAS } = require('../config/serviceAreas');

const router = express.Router();

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

module.exports = router;
