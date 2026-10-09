const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const adminController = require('../controllers/admin.controller');
const auth = require('../middlewares/auth.middleware');

const router = express.Router();

/** Notifications can fan out to every user (push/SMS cost), so POST gets its own limiter. */
const notificationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.NOTIFICATION_RATE_MAX || 10),
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.RATE_LIMIT_DISABLED === 'true',
    keyGenerator: (req) => `notify:${req.admin?._id || req.ip}`,
    handler: (req, res, _next, options) => {
        res.status(options.statusCode).json({
            success: false,
            ok: false,
            error: 'Too many notifications sent. Please wait a moment and try again.',
            message: 'Too many notifications sent. Please wait a moment and try again.',
            code: 'HTTP_429',
            requestId: req.requestId,
        });
    },
});

router.post('/login',
    body('email').trim().isEmail(),
    body('password').trim().isString().isLength({ min: 1 }),
    adminController.loginAdmin
);

router.get('/analytics', auth.authAdmin, adminController.getAnalytics);
router.get('/users', auth.authAdmin, adminController.getUsers);
router.get('/drivers', auth.authAdmin, adminController.getDrivers);
router.put('/drivers/:id/approve', auth.authAdmin, adminController.approveDriver);
router.put('/drivers/:id/reject', auth.authAdmin, adminController.rejectDriver);
router.patch('/drivers/:id/block', auth.authAdmin, adminController.blockDriver);
router.patch('/users/:id/block', auth.authAdmin, adminController.blockUser);
router.delete('/users/:id', auth.authAdmin, adminController.deleteUser);
router.delete('/drivers/:id', auth.authAdmin, adminController.deleteDriver);
router.delete('/rides/:id', auth.authAdmin, adminController.deleteRide);
router.get('/pricing', auth.authAdmin, adminController.getPricing);
router.put('/pricing', auth.authAdmin, adminController.updatePricing);
router.get('/fare-configurations', auth.authAdmin, adminController.getFareConfigurations);
router.post('/fare-configurations', auth.authAdmin, adminController.updateFareConfigurations);
router.put('/fare-configurations', auth.authAdmin, adminController.updateFareConfigurations);
router.get('/rides', auth.authAdmin, adminController.getRides);
router.get('/rides/:id', auth.authAdmin, adminController.getRideDetails);
router.get('/payments', auth.authAdmin, adminController.getPayments);
router.get('/subscriptions', auth.authAdmin, adminController.getSubscriptions);

// Audit Logs
router.get('/audit-logs', auth.authAdmin, adminController.getAuditLogs);

// Refunds
router.get('/refunds', auth.authAdmin, adminController.getRefunds);
router.post('/refunds/:id/process', auth.authAdmin, adminController.processRefund);
router.post('/refunds/:id/reject', auth.authAdmin, adminController.rejectRefund);

// SOS Events
router.get('/sos', auth.authAdmin, adminController.getSosEvents);
router.post('/sos/:id/resolve', auth.authAdmin, adminController.resolveSos);

// Support Tickets
router.get('/support-tickets', auth.authAdmin, adminController.getSupportTickets);
router.patch('/support-tickets/:id', auth.authAdmin, adminController.updateSupportTicket);

// Coupons
router.get('/coupons', auth.authAdmin, adminController.getCoupons);
router.post('/coupons', auth.authAdmin, adminController.createCoupon);
router.delete('/coupons/:id', auth.authAdmin, adminController.deleteCoupon);

// System Configuration
router.get('/config', auth.authAdmin, adminController.getConfig);
router.put('/config', auth.authAdmin, adminController.updateConfig);
router.get('/support', auth.authAdmin, adminController.getSupport);
router.put('/support', auth.authAdmin, adminController.updateSupport);
router.post('/notifications', auth.authAdmin, notificationLimiter, adminController.createNotification);
router.get('/notifications', auth.authAdmin, adminController.listNotifications);

module.exports = router;

