const captainModel = require('../models/captain.model');

function expiresAfterPlan (plan, from = new Date()) {
    const d = new Date(from.getTime());
    if (plan === 'weekly') d.setDate(d.getDate() + 7);
    else if (plan === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (plan === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else d.setDate(d.getDate() + 7);
    return d;
}

/**
 * Backfill missing expiry; mark expired if past end. Returns fresh captain doc.
 */
async function syncSubscriptionState (captainDoc) {
    if (!captainDoc) return captainDoc;
    const now = new Date();
    let patch = null;

    if (captainDoc.subscriptionStatus === 'active' && !captainDoc.subscriptionExpiresAt) {
        patch = { subscriptionExpiresAt: expiresAfterPlan('monthly', captainDoc.subscriptionStartedAt || now) };
    }

    const exp = patch?.subscriptionExpiresAt ?? captainDoc.subscriptionExpiresAt;
    if (captainDoc.subscriptionStatus === 'active' && exp && new Date(exp) < now) {
        patch = { ...(patch || {}), subscriptionStatus: 'expired' };
    }

    if (patch) {
        await captainModel.findByIdAndUpdate(captainDoc._id, patch);
    }
    return captainModel.findById(captainDoc._id);
}

function isSubscriptionValid (captain) {
    if (!captain || captain.subscriptionStatus !== 'active') return false;
    const exp = captain.subscriptionExpiresAt;
    if (!exp) return true;
    return new Date(exp) > new Date();
}

function buildExpiryReminders(captain) {
    if (!captain || captain.subscriptionStatus !== 'active' || !captain.subscriptionExpiresAt) return [];
    const ms = new Date(captain.subscriptionExpiresAt).getTime() - Date.now();
    if (!Number.isFinite(ms)) return [];
    if (ms <= 0) return [ { level: 'expired', message: 'Plan expired. Renew now to go online and accept rides.' } ];
    const dayMs = 24 * 60 * 60 * 1000;
    const days = Math.ceil(ms / dayMs);
    const out = [];
    if (days <= 1) out.push({ level: 'urgent', message: 'Your plan expires within 24 hours.' });
    else if (days <= 3) out.push({ level: 'info', message: `Your plan expires in ${days} days.` });
    return out;
}

module.exports = {
    expiresAfterPlan,
    syncSubscriptionState,
    isSubscriptionValid,
    buildExpiryReminders,
};
