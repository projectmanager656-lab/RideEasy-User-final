const mongoose = require('mongoose');

/**
 * Ledger of ride settlements and driver subscription charges (auditable).
 * Distinct from in-ride `ride.paymentStatus` — this is the history row.
 */
const paymentRecordSchema = new mongoose.Schema({
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'ride', default: null, index: true, sparse: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'captain', default: null, index: true, sparse: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', default: null, index: true, sparse: true },
    amount: { type: Number, required: true },
    paymentMode: { type: String, enum: [ 'UPI', 'QR', 'Cash', 'WALLET', 'PLAN' ], required: true },
    paymentStatus: { type: String, enum: [ 'pending', 'success', 'failed' ], default: 'success' },
    /** ride_fare | driver_subscription | platform_commission (future) */
    paymentType: { type: String, enum: [ 'ride_fare', 'driver_subscription', 'referral', 'other' ], default: 'ride_fare' },
    externalRef: { type: String, maxlength: 120 },
}, { timestamps: true, collection: 'payments' });

paymentRecordSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PaymentRecord', paymentRecordSchema);
