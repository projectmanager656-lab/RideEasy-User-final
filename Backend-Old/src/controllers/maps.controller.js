const mapService = require('../services/maps.service');

module.exports.getCoordinates = async (req, res) => {
    try {
        const address = (req.query.address || '').toString().trim();
        if (!address) return res.status(400).json({ message: 'Address required' });
        const coordinates = await mapService.getAddressCoordinate(address);
        return res.status(200).json(coordinates);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

module.exports.getDistanceTime = async (req, res) => {
    try {
        const origin = (req.query.origin || '').toString().trim();
        const destination = (req.query.destination || '').toString().trim();
        if (!origin || !destination) return res.status(400).json({ message: 'Origin & destination required' });
        const distanceTime = await mapService.getDistanceTime(origin, destination);
        return res.status(200).json(distanceTime);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

module.exports.getDrivingRoute = async (req, res) => {
    const fromLng = Number(req.query.fromLng);
    const fromLat = Number(req.query.fromLat);
    const toLng = Number(req.query.toLng);
    const toLat = Number(req.query.toLat);
    const overview = (req.query.overview || 'simplified').toString();

    if (![ fromLng, fromLat, toLng, toLat ].every(Number.isFinite)) {
        return res.status(400).json({ message: 'fromLng, fromLat, toLng, toLat must be numbers' });
    }

    try {
        const data = await mapService.getDrivingRoute(fromLng, fromLat, toLng, toLat, { overview });
        return res.status(200).json({
            ok: true,
            durationSec: data.durationSec,
            distanceMeters: data.distanceMeters,
            coordinates: data.coordinates || [],
        });
    } catch (err) {
        return res.status(500).json({ message: err.message || 'Route failed' });
    }
};

module.exports.getAutoCompleteSuggestions = async (req, res) => {
    try {
        const input = (req.query.input || '').toString().trim();
        if (!input) return res.status(200).json([]);
        const city = (req.query.city || '').toString().trim();
        const suggestions = await mapService.getAutoCompleteSuggestions(input, { city });
        return res.status(200).json(suggestions);
    } catch {
        return res.status(200).json([]);
    }
};

