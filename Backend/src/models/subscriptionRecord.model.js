const mongoose = require('mongoose');

/** Historical driver plan purchases (captain doc stays source of truth for "current" access). */
const subscriptionRecordSchema = new mongoose.Schema({
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'captain', required: true, index: true },
    vehicleType: { type: String, enum: [ 'BIKE', 'AUTO', 'CAR' ], required: true },
    planType: { type: String, enum: [ 'weekly', 'monthly', 'yearly', 'trial' ], required: true },
    amount: { type: Number, required: true },
    startDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    status: { type: String, enum: [ 'active', 'expired', 'cancelled' ], default: 'active' },
}, { timestamps: true, collection: 'subscriptions' });

subscriptionRecordSchema.index({ driverId: 1, createdAt: -1 });

module.exports = mongoose.model('SubscriptionRecord', subscriptionRecordSchema);
