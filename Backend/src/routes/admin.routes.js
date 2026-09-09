const express = require('express');
const { body } = require('express-validator');
const adminController = require('../controllers/admin.controller');
const auth = require('../middlewares/auth.middleware');

const router = express.Router();

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
router.get('/rides', auth.authAdmin, adminController.getRides);
router.get('/payments', auth.authAdmin, adminController.getPayments);
router.get('/subscriptions', auth.authAdmin, adminController.getSubscriptions);

module.exports = router;

