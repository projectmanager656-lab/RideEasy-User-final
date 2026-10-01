const mongoose = require('mongoose');

/** Recent GPS samples for analytics / replay; TTL removes stale points automatically. */
const driverLocationSchema = new mongoose.Schema({
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'captain', required: true, index: true },
    coordinates: {
        type: { type: String, enum: [ 'Point' ], default: 'Point' },
        coordinates: { type: [ Number ], required: true }, // [lng, lat]
    },
    heading: { type: Number, min: 0, max: 360 },
    speed: { type: Number, min: 0 },
    recordedAt: { type: Date, default: Date.now },
}, { collection: 'driverlocations' });

driverLocationSchema.index({ coordinates: '2dsphere' });
driverLocationSchema.index({ recordedAt: 1 }, { expireAfterSeconds: Number(process.env.DRIVER_LOCATION_TTL_SEC || 86400) });

module.exports = mongoose.model('DriverLocation', driverLocationSchema);
