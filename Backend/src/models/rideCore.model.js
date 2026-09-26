const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
    captain: { type: mongoose.Schema.Types.ObjectId, ref: 'captain', default: null },
    declinedBy: { type: [ { type: mongoose.Schema.Types.ObjectId, ref: 'captain' } ], default: [] },
    /**
     * Drivers that actually RECEIVED this ride's socket offer and acknowledged it.
     * A live room emit only proves the frame left the server, so this is the durable
     * receipt (one entry per captain, idempotent). Presence metadata only — delivery
     * targeting always uses the live `driver-<id>` room.
     */
    offerAcks: {
        type: [ {
            captain: { type: mongoose.Schema.Types.ObjectId, ref: 'captain' },
            at: { type: Date },
            socketId: { type: String },
        } ],
        default: [],
    },

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
        enum: [ 'scheduled', 'searching', 'accepted', 'arrived', 'started', 'completed', 'cancelled' ],
        default: 'searching',
    },

    /**
     * Scheduled bookings: `now` = normal Book Now (searches immediately),
     * `scheduled` = reserved for a future pickup and dispatched by the backend scheduler.
     */
    bookingType: { type: String, enum: [ 'now', 'scheduled' ], default: 'now' },
    /** Authoritative pickup instant (UTC) chosen by the passenger. Null for Book Now. */
    scheduledPickupAt: { type: Date, default: null },
    /** When the backend should move this ride from `scheduled` to `searching`. */
    dispatchAt: { type: Date, default: null },
    /**
     * When driver search actually began. Basis for the passenger search window, so a
     * ride scheduled hours in advance is not treated as an expired search on dispatch.
     * Equals creation time for Book Now.
     */
    searchStartedAt: { type: Date, default: null },

    /** Passenger-selected payment rail; settlement is still confirmed after completion. */
    paymentMethod: { type: String, enum: [ 'Cash', 'UPI', 'Online', 'Wallet' ], required: true, default: 'Cash' },
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
    originalFare: { type: Number },
    finalFare: { type: Number },
    /** Pre-ride 25% advance — billed online before the trip can start. */
    advancePaymentRequired: { type: Boolean, default: false },
    advancePercentage: { type: Number, default: 25 },
    advanceAmount: { type: Number, default: 0 },
    remainingAmount: { type: Number, default: 0 },
    /** Legacy paid flag read by the existing screens. `success` only after provider verification. */
    advancePaymentStatus: { type: String, enum: [ 'pending', 'success', 'failed' ], default: 'pending' },
    /** Advance lifecycle: pending → processing (order created) → paid | failed | cancelled. */
    advancePaymentState: {
        type: String,
        enum: [ 'pending', 'processing', 'paid', 'failed', 'cancelled' ],
        default: 'pending',
    },
    /** Provider payment id that was actually verified server-side. Never client-supplied. */
    advancePaymentTransactionId: { type: String, default: null },
    /** Reused across retries so repeated taps cannot open a second charge. */
    advancePaymentOrderId: { type: String, default: null },
    couponCode: { type: String, default: '' },
    customerName: { type: String },
    customerPhone: { type: String },
}, { timestamps: true });

rideSchema.index({ pickup: '2dsphere' });
/** Active ride lookup for driver location pipeline */
rideSchema.index({ captain: 1, status: 1 });
/** User history & support queries */
rideSchema.index({ user: 1, createdAt: -1 });
/** Driver earnings / day queries */
rideSchema.index({ captain: 1, status: 1, completedAt: -1 });
rideSchema.index({ status: 1, createdAt: -1 });
/** Scheduled-ride dispatcher: finds due `scheduled` rides on every tick. */
rideSchema.index({ status: 1, dispatchAt: 1 });

module.exports = mongoose.model('ride', rideSchema);

