/**
 * Live location pipeline — payloads mirror `socket/index.js` broadcasts.
 */
const { LOCATION_UPDATE } = require('../socket/rideSocket.events');

function passengerLocationPayload ({ rideId, lat, lng, at = Date.now() }) {
    return {
        rideId,
        lat,
        lng,
        at,
        source: 'passenger',
    };
}

function driverLocationPayload ({ rideId, lat, lng, at = Date.now() }) {
    return {
        rideId,
        lat,
        lng,
        at,
        source: 'driver',
    };
}

module.exports = {
    LOCATION_UPDATE,
    passengerLocationPayload,
    driverLocationPayload,
};
