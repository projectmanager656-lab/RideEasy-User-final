const express = require('express');
const mapsController = require('../controllers/maps.controller');
const auth = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/get-suggestions', auth.authUserOrCaptain, mapsController.getAutoCompleteSuggestions);
router.get('/get-coordinates', auth.authUserOrCaptain, mapsController.getCoordinates);
router.get('/get-distance-time', auth.authUserOrCaptain, mapsController.getDistanceTime);
router.get('/route', auth.authUserOrCaptain, mapsController.getDrivingRoute);

module.exports = router;

