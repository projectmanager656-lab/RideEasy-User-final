/**
 * Admin analytics & aggregates — safe read helpers (no destructive ops).
 */
const rideModel = require('../models/rideCore.model');

async function rideCountsByStatus () {
    const rows = await rideModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
    ]);
    return Object.fromEntries(rows.map((r) => [ r._id || 'unknown', r.count ]));
}

module.exports = {
    rideCountsByStatus,
};
