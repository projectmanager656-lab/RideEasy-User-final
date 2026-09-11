const express = require('express');
const { body, query } = require('express-validator');
const rideController = require('../controllers/ride.controller');
const auth = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/create',
    auth.authUser,
    body('pickupLocation').isString().isLength({ min: 3 }),
    body('dropLocation').isString().isLength({ min: 3 }),
    body('vehicleType').isString().isIn([ 'BIKE', 'AUTO', 'CAR' ]),
    body('paymentMethod').optional().isString().isIn([ 'Cash', 'UPI', 'Online' ]),
    body('price').isNumeric(),
    body('distanceKm').optional().isNumeric(),
    body('pickupLat').optional().isFloat({ min: -90, max: 90 }),
    body('pickupLng').optional().isFloat({ min: -180, max: 180 }),
    body('dropLat').optional().isFloat({ min: -90, max: 90 }),
    body('dropLng').optional().isFloat({ min: -180, max: 180 }),
    rideController.createRide
);

router.get('/get-fare',
    auth.authUser,
    query('pickup').optional().isString(),
    query('destination').optional().isString(),
    query('pickupLocation').optional().isString(),
    query('dropLocation').optional().isString(),
    query('pickupLat').optional().isFloat({ min: -90, max: 90 }),
    query('pickupLng').optional().isFloat({ min: -180, max: 180 }),
    query('dropLat').optional().isFloat({ min: -90, max: 90 }),
    query('dropLng').optional().isFloat({ min: -180, max: 180 }),
    rideController.getFare
);

/** Single-point check for maps UI — auth user or captain. */
router.get('/service-area-check',
    auth.authUserOrCaptain,
    query('lat').isFloat({ min: -90, max: 90 }),
    query('lng').isFloat({ min: -180, max: 180 }),
    rideController.checkServiceArea
);

router.get('/pending', auth.authCaptain, rideController.getPendingRides);
router.get('/user/history', auth.authUser, rideController.userRideHistory);
router.get('/history', auth.authUser, rideController.userRideHistory);
router.get('/:id/passenger-otp', auth.authUser, rideController.getPassengerOtp);

router.patch('/:id/accept', auth.authCaptain, rideController.acceptRide);
router.patch('/:id/reject', auth.authCaptain, rideController.rejectRide);
router.patch('/:id/cancel', auth.authUser, body('reason').optional().isString().isLength({ max: 240 }), rideController.cancelRideByUser);
router.patch('/:id/cancel-by-captain', auth.authCaptain, body('reason').optional().isString().isLength({ max: 240 }), rideController.cancelRideByCaptain);
router.post('/confirm', auth.authCaptain, body('rideId').isMongoId(), rideController.confirmRide);
router.post('/arrive', auth.authCaptain, body('rideId').isMongoId(), rideController.arriveRide);
router.get('/start-ride', auth.authCaptain, query('rideId').isMongoId(), query('otp').isString().isLength({ min: 6, max: 6 }), rideController.startRide);
router.post('/end-ride', auth.authCaptain, body('rideId').isMongoId(), rideController.endRide);
router.post('/confirm-passenger-paid',
    auth.authCaptain,
    body('rideId').isMongoId(),
    rideController.confirmPassengerPaidCaptain);
router.post('/rate-passenger',
    auth.authCaptain,
    body('rideId').isMongoId(),
    body('rating').isInt({ min: 1, max: 5 }),
    body('tags').optional().isArray(),
    rideController.ratePassengerByCaptain);
router.post('/rate',
    auth.authUser,
    body('rideId').isMongoId(),
    body('rating').isNumeric(),
    body('comment').optional().isString().isLength({ max: 500 }),
    rideController.rateRide
);

router.post('/:id/retry-assign', auth.authUser, rideController.retryAssign);

/** Passenger records a real ride payment (advance/remaining) — persists a ledger row. */
router.post('/pay-mock', auth.authUser, rideController.payMock);
/** Passenger verifies a UPI payment intent (real, idempotent ledger write). */
router.post('/upi/verify', auth.authUser, rideController.verifyUpiPayment);
/** Passenger invoice built from the actual ride + payment ledger. */
router.get('/:id/invoice', auth.authUser, rideController.getRideInvoice);

router.get('/:id', auth.authUserOrCaptain, rideController.getRideById); // keep after /:id/passenger-otp

module.exports = router;
