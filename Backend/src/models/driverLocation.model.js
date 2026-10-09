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
    accuracy: { type: Number, min: 0 },
    /**
     * H3 resolution-9 cell of `coordinates` — candidate-discovery index only.
     * Present ONLY on the driver's current-position row (upserted by
     * driverHex.service.recordDriverGps); append-only analytics samples never
     * carry it, so the current row stays unique per driver.
     */
    h3Cell: { type: String },
    recordedAt: { type: Date, default: Date.now },
}, { collection: 'driverlocations' });

driverLocationSchema.index({ coordinates: '2dsphere' });
driverLocationSchema.index({ recordedAt: 1 }, { expireAfterSeconds: Number(process.env.DRIVER_LOCATION_TTL_SEC || 86400) });
/* Ring search: filter by cell(s), freshness decides staleness. Distinct from the indexes above. */
driverLocationSchema.index({ h3Cell: 1, recordedAt: -1 });

module.exports = mongoose.model('DriverLocation', driverLocationSchema);
