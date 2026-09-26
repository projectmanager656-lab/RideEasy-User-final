/**
 * Reporting aggregates — safe read-only helpers for admin / monitoring.
 */
const adminService = require('./admin.service');
const captainModel = require('../models/captain.model');
const userModel = require('../models/user.model');
const rideModel = require('../models/rideCore.model');

async function overviewRideStats () {
    const byStatus = await adminService.rideCountsByStatus();
    const total = Object.values(byStatus).reduce((a, n) => a + n, 0);
    return { byStatus, totalRides: total };
}

async function activeDriversOnline () {
    return captainModel.countDocuments({
        status: 'active',
        approved: true,
        blocked: { $ne: true },
        isOnline: true,
    });
}

async function activeUsersApprox () {
    /** Users with recent socket activity would need Redis — count registered users as proxy */
    return userModel.estimatedDocumentCount();
}

async function rideOutcomeCounts () {
    const [ completed, cancelled ] = await Promise.all([
        rideModel.countDocuments({ status: 'completed' }),
        rideModel.countDocuments({ status: 'cancelled' }),
    ]);
    return { completed, cancelled };
}

/** Revenue-weighted ride counts by city (top zones). */
async function ridesByCityTop () {
    const rows = await rideModel.aggregate([
        { $match: { status: 'completed', city: { $exists: true } } },
        { $group: { _id: '$city', rides: { $sum: 1 }, revenue: { $sum: { $ifNull: [ '$price', 0 ] } } } },
        { $sort: { rides: -1 } },
        { $limit: 10 },
    ]);
    return rows.map((r) => ({ city: r._id, rides: r.rides, revenue: Math.round(r.revenue || 0) }));
}

async function dashboardSnapshot () {
    const [ overview, activeDrivers, outcomes, topZones ] = await Promise.all([
        overviewRideStats(),
        activeDriversOnline(),
        rideOutcomeCounts(),
        ridesByCityTop(),
    ]);
    return {
        ...overview,
        activeDriversOnline: activeDrivers,
        ...outcomes,
        topZones,
    };
}

module.exports = {
    overviewRideStats,
    activeDriversOnline,
    activeUsersApprox,
    rideOutcomeCounts,
    ridesByCityTop,
    dashboardSnapshot,
};
