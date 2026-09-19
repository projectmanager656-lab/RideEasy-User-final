/** Real-time ride flow — keep names stable for mobile/web clients. */
module.exports = {
    RIDE_REQUEST: 'rideRequest',
    RIDE_ACCEPTED: 'rideAccepted',
    RIDE_STARTED: 'rideStarted',
    RIDE_COMPLETED: 'rideCompleted',
    /** Standardized phases (dual-emit when RIDEEASY_STANDARD_SOCKET_EVENTS=true) */
    PHASE_SEARCHING: 'ride:searching',
    PHASE_ASSIGNED: 'ride:assigned',
    PHASE_ARRIVED: 'ride:arrived',
    PHASE_STARTED: 'ride:started',
    PHASE_COMPLETED: 'ride:completed',
    DRIVER_LOCATION: 'driver:location',
    DRIVER_ONLINE: 'driver:online',
    DRIVER_OFFLINE: 'driver:offline',
    /**
     * Bidirectional live GPS. Payload includes `source`: `driver` | `passenger`.
     * { rideId, lat, lng, at, source }
     */
    LOCATION_UPDATE: 'locationUpdate',
};
