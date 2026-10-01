/**
 * Captain (driver) domain — earnings, presence-related reads.
 * Subscription plan math remains in {@link ./subscriptionDriver.service.js}.
 */
const captainModel = require('../models/captain.model');
const rideModel = require('../models/rideCore.model');
const subscriptionDriver = require('./subscriptionDriver.service');

async function getEarningsSummary (captainId) {
    const cap = await captainModel.findById(captainId);
    const completed = await rideModel.find({ captain: captainId, status: 'completed' })
        .select('price captainNetEarning completedAt createdAt paymentStatus');
    const earn = (r) => (r.captainNetEarning != null ? r.captainNetEarning : (r.price || 0));
    const totalFromRides = completed.reduce((sum, r) => sum + earn(r), 0);
    const count = completed.length;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayRides = completed.filter((r) => {
        const t = r.completedAt || r.createdAt;
        return t && new Date(t) >= todayStart;
    });
    const todayEarnings = todayRides.reduce((sum, r) => sum + earn(r), 0);

    const start7d = new Date();
    start7d.setDate(start7d.getDate() - 6);
    start7d.setHours(0, 0, 0, 0);
    const last7Days = {};
    for (const r of completed) {
        const t = r.completedAt || r.createdAt;
        if (!t || new Date(t) < start7d) continue;
        const key = new Date(t).toISOString().slice(0, 10);
        last7Days[key] = (last7Days[key] || 0) + earn(r);
    }

    return {
        totalEarnings: cap?.totalEarnings ?? totalFromRides,
        walletBalance: cap?.walletBalance ?? 0,
        completedRides: count,
        count,
        todayEarnings,
        todayRides: todayRides.length,
        last7Days,
    };
}

module.exports = {
    ...subscriptionDriver,
    getEarningsSummary,
};
