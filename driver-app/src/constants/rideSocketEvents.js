/** Must match backend/src/socket/rideSocket.events.js */
export const RIDE_REQUEST = 'rideRequest'
export const RIDE_ACCEPTED = 'rideAccepted'
export const RIDE_STARTED = 'rideStarted'
export const RIDE_COMPLETED = 'rideCompleted'

/** Live GPS for driver ↔ passenger. Payload: { rideId, lat, lng, at, source: 'driver' | 'passenger' } */
export const LOCATION_UPDATE = 'locationUpdate'
