const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
    captain: { type: mongoose.Schema.Types.ObjectId, ref: 'captain', default: null },
    declinedBy: { type: [ { type: mongoose.Schema.Types.ObjectId, ref: 'captain' } ], default: [] },

    pickupLocation: { type: String, required: true },
    dropLocation: { type: String, required: true },

    pickup: {
        type: { type: String, enum: [ 'Point' ] },
        coordinates: { type: [ Number ], default: undefined }, // [lng, lat]
    },
    drop: {
        type: { type: String, enum: [ 'Point' ] },
        coordinates: { type: [ Number ], default: undefined }, // [lng, lat]
    },

    city: { type: String, enum: [ 'Kolhapur', 'Ichalkaranji', 'Sangli' ], required: true },
    vehicleType: { type: String, enum: [ 'BIKE', 'AUTO', 'CAR' ], required: true },
    distance: { type: Number, required: true }, // km
    price: { type: Number, required: true },

    status: {
        type: String,
        enum: [ 'searching', 'accepted', 'arrived', 'started', 'completed', 'cancelled' ],
        default: 'searching',
    },

    paymentMethod: { type: String, enum: [ 'UPI', 'QR', 'Cash', 'WALLET' ], required: true },
    paymentStatus: { type: String, enum: [ 'pending', 'success', 'failed' ], default: 'pending' },
    duration: { type: Number }, // seconds
    cancellationFee: { type: Number, default: 0 },
    cancelledBy: { type: String, enum: [ 'user', 'captain', 'system' ] },
    cancelledAt: { type: Date },
    cancellationReason: { type: String, maxlength: 240 },

    /** bcrypt hash — verify only */
    otpHash: { type: String, select: false },
    /** AES-GCM ciphertext — passenger OTP display via HTTPS only */
    otpCipher: { type: String, select: false },
    otpExpiresAt: { type: Date },
    acceptedAt: { type: Date },
    arrivedAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    rating: { type: Number, min: 1, max: 5 },
    ratingComment: { type: String, maxlength: 500 },
    /** Driver's rating of the passenger (optional). */
    captainPassengerRating: { type: Number, min: 1, max: 5 },
    captainPassengerTags: { type: [ String ], default: [] },
    captainNetEarning: { type: Number },
    platformFee: { type: Number },
    discountAmount: { type: Number, default: 0 },
    discountReason: { type: String, default: '' },
    chargedAmount: { type: Number },
    customerName: { type: String },
    customerPhone: { type: String },
    /** Stable, human-readable invoice id — assigned once when the ride completes. */
    invoiceNumber: { type: String, index: true },
    /** Internal per-day invoice sequence counter (counter doc only). */
    invoiceSeqKey: { type: String },
    invoiceSeq: { type: Number, default: 0 },
}, { timestamps: true });

rideSchema.index({ pickup: '2dsphere' });
/** Active ride lookup for driver location pipeline */
rideSchema.index({ captain: 1, status: 1 });
/** User history & support queries */
rideSchema.index({ user: 1, createdAt: -1 });
/** Driver earnings / day queries */
rideSchema.index({ captain: 1, status: 1, completedAt: -1 });
rideSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ride', rideSchema);

