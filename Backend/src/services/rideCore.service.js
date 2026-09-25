const rideModel = require('../models/rideCore.model');
const captainModel = require('../models/captain.model');
const mapService = require('./maps.service');
const { expiresInMinutes, randomSixDigit } = require('../utils/otp');
const { encryptOtp, hashOtp, verifyOtp } = require('../utils/otpSecure');
const pricingService = require('./pricing.service');
const paymentService = require('./payment.service');
const ratingService = require('./rating.service');
const ALLOWED_VEHICLE_TYPES = [ 'BIKE', 'AUTO', 'CAR' ];

function rideError(message, statusCode = 400) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

const ACTIVE_RIDE_STATUSES = [ 'accepted', 'arrived', 'started' ];

async function releaseCaptainBusyIfAvailable(captainRef) {
    if (!captainRef) return;
    const captainId = captainRef?._id || captainRef;
    const activeRideQuery = rideModel.findOne({
        captain: captainId,
        status: { $in: ACTIVE_RIDE_STATUSES },
    });
    const activeRide = typeof activeRideQuery?.select === 'function'
        ? await activeRideQuery.select('_id').lean()
        : await activeRideQuery;
    if (!activeRide) {
        await captainModel.updateOne(
            { _id: captainId, busy: true },
            { $set: { busy: false } },
        );
    }
}

module.exports.releaseCaptainBusyIfAvailable = releaseCaptainBusyIfAvailable;

function normalizePaymentMethod(method) {
    const m = String(method || '').trim();
    if (m === 'UPI') return 'UPI';
    if (m === 'Online') return 'Online';
    if (m === 'Wallet') return 'Wallet';
    return 'Cash';
}
module.exports.normalizePaymentMethod = normalizePaymentMethod;

/** Re-export for backward compatibility — prefer `payment.service`. */
module.exports.settleRidePaymentIfNeeded = paymentService.settleRidePaymentIfNeeded;

/** Pre-ride advance: the one shared 25% split, always recomputed from the stored fare. */
const { ADVANCE_PERCENTAGE, computeAdvanceSplit } = paymentService;
module.exports.ADVANCE_PERCENTAGE = ADVANCE_PERCENTAGE;
module.exports.computeAdvanceSplit = computeAdvanceSplit;

/**
 * Payment rails that collect the 25% advance online before the trip may start.
 * Cash and Wallet keep their existing behaviour untouched.
 */
const ADVANCE_REQUIRED_METHODS = [ 'UPI', 'Online' ];

async function buildFarePayload(pickup, destination, coordOpts = null) {
    if (!pickup || !destination) throw new Error('Pickup and destination are required');
    const distanceTime =
        coordOpts?.pickupCoord && coordOpts?.dropCoord
            ? await mapService.getDistanceTimeCoords(coordOpts.pickupCoord, coordOpts.dropCoord)
            : await mapService.getDistanceTime(pickup, destination);
    const distanceKm = distanceTime.distance.value / 1000;
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
        throw rideError('Distance must be greater than 0', 400);
    }
    const rates = await pricingService.getRates();
    const fare = {};
    for (const vt of ALLOWED_VEHICLE_TYPES) {
        const cfg = rates[vt];
        if (!cfg) continue;
        fare[vt] = Math.round(cfg.baseFare + distanceKm * cfg.perKm + cfg.platformFee);
    }
    return {
        distanceKm: Math.round(distanceKm * 100) / 100,
        distanceMeters: distanceTime.distance.value,
        durationSeconds: distanceTime.duration.value,
        durationMinutes: Math.round(distanceTime.duration.value / 60),
        ...fare,
    };
}

module.exports.getFare = async (pickup, destination, coordOpts = null) =>
    buildFarePayload(pickup, destination, coordOpts);

function normalizeVehicleType(vt) {
    const up = String(vt || '').trim().toUpperCase();
    if (up === 'MINI' || up === 'SEDAN') return 'CAR';
    return up;
}
module.exports.normalizeVehicleType = normalizeVehicleType;

module.exports.createRide = async ({
    user,
    pickupLocation,
    dropLocation,
    city,
    vehicleType,
    paymentMethod,
    price,
    distanceKm,
    customerName,
    customerPhone,
    discountAmount,
    discountReason,
    couponCode,
    pickupCoordinates,
    dropCoordinates,
    bookingType = 'now',
    scheduledPickupAt = null,
    dispatchAt = null,
}) => {
    /** Book Now searches straight away; a scheduled booking waits for `dispatchAt`. */
    const isScheduled = bookingType === 'scheduled';
    const method = normalizePaymentMethod(paymentMethod);
    /**
     * The 25% advance is fixed at booking time from the fare the server itself
     * computed, so every later screen and the payment gateway read the SAME split.
     */
    const advanceRequired = ADVANCE_REQUIRED_METHODS.includes(method);
    const advanceSplit = computeAdvanceSplit({ price, discountAmount });
    /** OTP is created only when the driver arrives. */
    const ride = await rideModel.create({
        user,
        pickupLocation,
        dropLocation,
        ...(pickupCoordinates ? { pickup: { type: 'Point', coordinates: [ pickupCoordinates.lng, pickupCoordinates.lat ] } } : {}),
        ...(dropCoordinates ? { drop: { type: 'Point', coordinates: [ dropCoordinates.lng, dropCoordinates.lat ] } } : {}),
        city: city || 'Kolhapur',
        vehicleType: normalizeVehicleType(vehicleType),
        distance: distanceKm,
        price,
        discountAmount: Number(discountAmount || 0),
        discountReason: discountReason || '',
        couponCode: couponCode || '',
        originalFare: Math.round(Number(price || 0) * 100) / 100,
        finalFare: advanceSplit.payable,
        chargedAmount: advanceSplit.payable,
        status: isScheduled ? 'scheduled' : 'searching',
        bookingType: isScheduled ? 'scheduled' : 'now',
        scheduledPickupAt: isScheduled ? scheduledPickupAt : null,
        dispatchAt: isScheduled ? dispatchAt : null,
        searchStartedAt: isScheduled ? null : new Date(),
        paymentMethod: method,
        paymentStatus: 'pending',
        advancePaymentRequired: advanceRequired,
        advancePercentage: ADVANCE_PERCENTAGE,
        advanceAmount: advanceRequired ? advanceSplit.advanceAmount : 0,
        remainingAmount: advanceRequired ? advanceSplit.remainingAmount : 0,
        advancePaymentState: 'pending',
        customerName,
        customerPhone,
    });
    return { ride };
};

/** First driver wins — atomic claim while status is searching and no captain. */
module.exports.confirmRide = async ({ rideId, captain }) => {
    const ride = await rideModel.findOneAndUpdate(
        {
            _id: rideId,
            status: 'searching',
            $or: [ { captain: null }, { captain: { $exists: false } } ],
        },
        {
            $set: {
                captain: captain._id,
                status: 'accepted',
                acceptedAt: new Date(),
            },
            $unset: {
                otpHash: 1,
                otpCipher: 1,
                otpExpiresAt: 1,
            },
        },
        { new: true }
    ).populate('user').populate('captain');

    if (!ride) {
        const exists = await rideModel.findById(rideId);
        if (!exists) throw rideError('Ride not found', 404);
        throw rideError('Ride already assigned or no longer available', 409);
    }

    const busyUpdate = await captainModel.updateOne(
        { _id: captain._id, busy: { $ne: true } },
        { $set: { busy: true } },
    );
    if (!busyUpdate?.matchedCount) {
        await rideModel.updateOne(
            { _id: ride._id, captain: captain._id, status: 'accepted' },
            {
                $set: { captain: null, status: 'searching' },
                $unset: {
                    acceptedAt: 1,
                    otpHash: 1,
                    otpCipher: 1,
                    otpExpiresAt: 1,
                },
            },
        );
        throw rideError('Captain already has an active ride.', 409);
    }
    return { ride };
};

module.exports.rejectRide = async ({ rideId, captain }) => {
    const result = await rideModel.updateOne(
        {
            _id: rideId,
            status: 'searching',
            $or: [ { captain: null }, { captain: { $exists: false } } ],
        },
        { $addToSet: { declinedBy: captain._id } }
    );
    if (!result?.matchedCount) {
        const ride = await rideModel.findById(rideId);

        if (!ride) throw rideError('Ride not found', 404);
        throw rideError('Ride already assigned or no longer available', 409);
    }
    return rideModel.findById(rideId).populate('user', 'name phone email').populate('captain');
};

module.exports.markArrived = async ({ rideId, captain }) => {
    const current = await rideModel.findOne({ _id: rideId, captain: captain._id })
        .populate('user')
        .populate('captain');
    if (!current) throw rideError('Ride not found', 404);
    if (current.status === 'arrived') return { ride: current, otpPlain: null };
    if (current.status !== 'accepted') throw rideError('Ride not found / not accepted', 409);
    const otpPlain = randomSixDigit();
    const [ otpHash, otpCipher ] = await Promise.all([
        hashOtp(otpPlain),
        Promise.resolve(encryptOtp(otpPlain)),
    ]);
    const ride = await rideModel.findOneAndUpdate(
        { _id: rideId, captain: captain._id, status: 'accepted' },
        {
            $set: {
                status: 'arrived',
                arrivedAt: new Date(),
                otpHash,
                otpCipher,
                otpExpiresAt: expiresInMinutes(5),
            },
        },
        { new: true }
    ).populate('user').populate('captain');
    if (!ride) throw rideError('Ride not found / not accepted', 409);
    return { ride, otpPlain };
};

module.exports.startRide = async ({ rideId, otp, captain }) => {
    const ride = await rideModel.findOne({ _id: rideId, captain: captain._id })
        .populate('user')
        .populate('captain')
        .select('+otpHash');
    if (!ride) throw rideError('Ride not found', 404);
    if (ride.status !== 'arrived') throw rideError('Driver has not arrived', 409);
    const ok = await verifyOtp(String(otp || '').trim(), ride.otpHash);
    if (!ok) throw rideError('Invalid OTP', 400);
    if (ride.otpExpiresAt && ride.otpExpiresAt < new Date()) throw rideError('OTP expired — ask passenger for new code', 400);
    /**
     * The 25% advance has to be verified by the payment provider before the trip
     * may start — a valid OTP alone is not proof of payment. Only the online rails
     * carry the requirement, so Cash and Wallet keep their existing behaviour.
     */
    if (ride.advancePaymentRequired && ride.advancePaymentStatus !== 'success') {
        throw rideError('Passenger must complete the 25% advance payment before this ride can start', 402);
    }
    await rideModel.updateOne({ _id: rideId }, { status: 'started', startedAt: new Date() });
    return rideModel.findById(rideId).populate('user').populate('captain');
};

module.exports.endRide = async ({ rideId, captain }) => {
    const ride = await rideModel.findOne({ _id: rideId, captain: captain._id }).populate('user').populate('captain');
    if (!ride) throw rideError('Ride not found', 404);
    if (ride.status !== 'started') throw rideError('Ride not started', 409);

    const completedAt = new Date();
    let durationSec = null;
    if (ride.startedAt) {
        durationSec = Math.max(
            0,
            Math.round((completedAt.getTime() - new Date(ride.startedAt).getTime()) / 1000),
        );
    }

    const payable = ride.chargedAmount != null
        ? Number(ride.chargedAmount)
        : Math.max(0, Number(ride.price || 0) - Number(ride.discountAmount || 0));
    const isFullyPaidByCoupon = payable === 0 && Number(ride.discountAmount || 0) > 0;

    const patch = {
        status: 'completed',
        completedAt,
        ...(durationSec != null ? { duration: durationSec } : {}),
        ...(isFullyPaidByCoupon ? { paymentStatus: 'success', chargedAmount: 0 } : {}),
    };
    await rideModel.updateOne({ _id: rideId }, patch);
    await releaseCaptainBusyIfAvailable(captain._id);

    if (isFullyPaidByCoupon) {
        try {
            await paymentService.settleRidePaymentIfNeeded(rideId);
        } catch (e) {
            console.warn('[endRide] zero-payable coupon settlement warning:', e?.message);
        }
    }
    // Cash is settled only when the assigned captain confirms receipt.
    return rideModel.findById(rideId).populate('user', 'name phone email').populate('captain');
};

module.exports.rateRide = async ({ rideId, user, rating, comment }) => {
    const r = Number(rating);
    if (!Number.isFinite(r) || r < 1 || r > 5) throw rideError('Rating must be between 1 and 5', 400);
    const ride = await rideModel.findOne({
        _id: rideId,
        user,
        status: 'completed',
        paymentStatus: 'success',
    });
    if (!ride) throw rideError('Ride not found or payment not completed', 404);
    if (ride.rating) throw rideError('Already rated', 409);
    ride.rating = r;
    ride.ratingComment = (comment || '').slice(0, 500);
    await ride.save();
    await ratingService.recordRating({
        rideId: ride._id,
        fromUserId: ride.user,
        toUserId: ride.captain || null,
        fromRole: 'USER',
        rating: r,
        comment: ride.ratingComment,
    });
    if (ride.captain) {
        await captainModel.findByIdAndUpdate(ride.captain, { $inc: { ratingSum: r, ratingCount: 1 } });
    }
    return rideModel.findById(ride._id).populate('captain').populate('user', 'name phone email');
};
