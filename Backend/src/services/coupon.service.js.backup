const Coupon = require('../models/coupon.model');
const CouponUsage = require('../models/couponUsage.model');
const userModel = require('../models/user.model');
const rideModel = require('../models/rideCore.model');
const WalletTransaction = require('../models/walletTransaction.model');

function couponError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function round2(value) {
    return Math.round(Number(value || 0) * 100) / 100;
}

/** Tolerates Date, ISO string, and the malformed `{ $date: "..." }` documents seen in the collection. */
function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'object' && value.$date != null) return new Date(value.$date);
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The `coupons` collection is produced by more than one writer, so a coupon row may
 * use either the live names (isActive / validFrom / validUntil / minFare) or the
 * older aliases (active / expiresAt / minimumFare). Normalize both into one shape.
 */
function normalizeCoupon(raw) {
    if (!raw) return null;
    const type = String(raw.discountType || '').toLowerCase();
    const validUntil = toDate(raw.validUntil) || toDate(raw.expiresAt);
    const validFrom = toDate(raw.validFrom);
    const local = raw.minFare != null ? raw.minFare : raw.minimumFare;
    const isActive = raw.isActive !== undefined ? raw.isActive !== false : raw.active !== false;
    return {
        _id: raw._id,
        code: String(raw.code || '').toUpperCase(),
        title: raw.title || raw.code || 'Coupon',
        description: raw.description || '',
        eligibility: raw.eligibility || 'All eligible users',
        discountType: type === 'percentage' ? 'percentage' : 'fixed',
        discountValue: Number(raw.discountValue || 0),
        maxDiscount: raw.maxDiscount != null ? Number(raw.maxDiscount) : null,
        minimumFare: Number(local || 0),
        isActive,
        validFrom,
        validUntil,
        // Alias kept so the existing UI can read `expiresAt` unchanged.
        expiresAt: validUntil,
        usageLimit: raw.usageLimit != null ? Number(raw.usageLimit) : null,
        usedCount: Number(raw.usedCount || 0),
        // Only an explicit flag (or an explicit eligibility rule) makes a coupon
        // first-ride-only — never the marketing copy in title/description.
        isNewUserOnly: Boolean(
            raw.isNewUserOnly === true ||
            /new\s*user|first\s*ride/i.test(String(raw.eligibility || ''))
        ),
        creditExcessToWallet: raw.creditExcessToWallet !== false,
    };
}

function isExpired(coupon, now) {
    return Boolean(coupon.validUntil && new Date(coupon.validUntil) <= now);
}

function isNotYetValid(coupon, now) {
    return Boolean(coupon.validFrom && new Date(coupon.validFrom) > now);
}

function computeNominalDiscount(coupon, fare) {
    let nominal = coupon.discountType === 'percentage'
        ? (fare * coupon.discountValue) / 100
        : coupon.discountValue;
    if (coupon.maxDiscount != null && coupon.maxDiscount > 0) {
        nominal = Math.min(nominal, coupon.maxDiscount);
    }
    return Math.max(0, round2(nominal));
}

/** Active + within validity window, matching both field namings. */
function availabilityFilter(now) {
    return {
        $and: [
            { $or: [ { isActive: true }, { active: true } ] },
            { $or: [ { validUntil: null }, { validUntil: { $gt: now } }, { expiresAt: null }, { expiresAt: { $gt: now } } ] },
        ],
    };
}

async function listAvailableCoupons(userId) {
    const now = new Date();
    const rows = await Coupon.find(availabilityFilter(now)).sort({ createdAt: -1 }).lean();
    const list = rows
        .map(normalizeCoupon)
        .filter((c) => c && c.isActive && !isExpired(c, now) && !isNotYetValid(c, now));

    let usedIds = new Set();
    if (userId && list.length) {
        const used = await CouponUsage.find({ userId, couponId: { $in: list.map((c) => c._id) } })
            .select('couponId')
            .lean();
        usedIds = new Set(used.map((u) => String(u.couponId)));
    }

    return list.map((c) => ({
        ...c,
        used: usedIds.has(String(c._id)),
        expired: false,
    }));
}

async function findCouponByCode(code) {
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized) return null;
    return Coupon.findOne({ code: normalized }).lean();
}

async function validateCoupon({ code, userId, fare, session = null }) {
    const normalized = String(code || '').trim().toUpperCase();
    const baseFare = Number(fare);
    if (!normalized) return { coupon: null, discountAmount: 0, finalFare: baseFare, excessDiscount: 0 };

    const couponQuery = Coupon.findOne({ code: normalized });
    if (session) couponQuery.session(session);
    const raw = await couponQuery.lean();
    if (!raw) throw couponError('Invalid coupon code', 404);
    const coupon = normalizeCoupon(raw);

    const now = new Date();
    if (!coupon.isActive) throw couponError('Coupon is not active', 400);
    if (isNotYetValid(coupon, now)) throw couponError('Coupon is not active yet', 400);
    if (isExpired(coupon, now)) throw couponError('Coupon has expired', 400);
    if (coupon.usageLimit != null && coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
        throw couponError('Coupon usage limit has been reached', 400);
    }

    if (!Number.isFinite(baseFare) || baseFare <= 0) throw couponError('Fare is invalid', 400);
    if (baseFare < coupon.minimumFare) {
        throw couponError(`Minimum fare for this coupon is ₹${coupon.minimumFare}`, 400);
    }

    // One redemption per user, ever. Checked before new-user eligibility so a repeat
    // attempt on an already-claimed coupon always reports "already used".
    if (userId) {
        const usageQuery = CouponUsage.exists({ couponId: coupon._id, userId });
        if (session) usageQuery.session(session);
        if (await usageQuery) throw couponError('Coupon has already been used', 409);
    }

    // New-user / first-ride coupons: only before the passenger's first non-cancelled ride.
    if (coupon.isNewUserOnly && userId) {
        const priorRidesQuery = rideModel.countDocuments({ user: userId, status: { $ne: 'cancelled' } });
        if (session) priorRidesQuery.session(session);
        if ((await priorRidesQuery) > 0) {
            throw couponError('This coupon is valid only for new users on their first ride', 400);
        }
    }

    const nominalDiscount = computeNominalDiscount(coupon, baseFare);
    const discountAmount = round2(Math.min(baseFare, nominalDiscount));
    const finalFare = round2(Math.max(0, baseFare - discountAmount));
    const excessDiscount = round2(Math.max(0, nominalDiscount - discountAmount));

    return { coupon, discountAmount, finalFare, excessDiscount, nominalDiscount };
}

/**
 * Atomically reserves a coupon for a ride so a passenger can never redeem the same
 * coupon twice (unique index on couponId+userId). Throws 409 on a duplicate claim.
 */
async function reserveCoupon({ coupon, userId, rideId, discountAmount, excessDiscount = 0, session = null }) {
    try {
        const [usage] = await CouponUsage.create([{
            couponId: coupon._id,
            userId,
            rideId,
            discountAmount: round2(discountAmount),
            excessDiscount: round2(excessDiscount),
            settled: false,
        }], session ? { session } : {});
        return usage;
    } catch (err) {
        if (err?.code === 11000) throw couponError('Coupon has already been used', 409);
        throw err;
    }
}

/**
 * Releases a reservation made at booking time when the ride never happens (passenger
 * or driver cancels before payment). Only unsettled rows are removed, so a coupon that
 * was actually redeemed is never freed for reuse. `usedCount` is incremented by
 * settleCouponRedemption, never by reserveCoupon, so there is no counter to roll back.
 */
async function releaseCoupon({ rideId, session = null }) {
    if (!rideId) return null;
    const query = CouponUsage.deleteMany({ rideId, settled: { $ne: true } });
    if (session) query.session(session);
    return query;
}

/**
 * Frees reservations held by rides that are stuck in `searching` past the age this app
 * already treats as dead (`PENDING_RIDE_MAX_AGE_MIN` — the very cutoff
 * `findPendingRidesForCaptain` uses to hide such rides from drivers). The ride is no
 * longer genuinely active, so its coupon must not stay hidden from the passenger.
 *
 * The ride itself is deliberately NOT touched: this codebase only ever hides stale
 * searching rides, it never cancels or expires them, and that is out of scope here.
 *
 * Idempotent — releasing an already-released or absent reservation is a no-op, and
 * settled redemptions are never touched (`releaseCoupon` filters `settled != true`).
 */
async function releaseStaleCouponReservations({ now = new Date() } = {}) {
    const maxAgeMin = Number(process.env.PENDING_RIDE_MAX_AGE_MIN || 45);
    const limit = Math.max(1, Number(process.env.STALE_COUPON_SWEEP_LIMIT || 500));
    const cutoff = new Date(now.getTime() - maxAgeMin * 60 * 1000);

    const staleRides = await rideModel
        .find({ status: 'searching', createdAt: { $lt: cutoff } })
        .select('_id')
        .limit(limit)
        .lean();

    let released = 0;
    for (const ride of staleRides) {
        const res = await releaseCoupon({ rideId: ride._id });
        released += res?.deletedCount || 0;
    }

    return { staleRides: staleRides.length, released };
}

/**
 * Marks a reserved coupon as redeemed after a successful ride/payment: increments the
 * global `usedCount` exactly once and credits any excess discount to the wallet.
 * Safe to call repeatedly and inside a transaction.
 */
async function settleCouponRedemption({ rideId, session = null }) {
    if (!rideId) return null;
    const rideQuery = rideModel.findById(rideId);
    if (session) rideQuery.session(session);
    const ride = await rideQuery;
    if (!ride || !ride.couponCode) return null;

    const claimQuery = CouponUsage.findOne({ rideId });
    if (session) claimQuery.session(session);
    let claim = await claimQuery;
    if (claim && claim.settled) {
        return { alreadySettled: true, usage: claim, excessCredited: claim.excessDiscount || 0 };
    }

    const rawCoupon = await findCouponByCode(ride.couponCode);
    if (!rawCoupon) return null;
    const coupon = normalizeCoupon(rawCoupon);

    const baseFare = Number(ride.price || 0);
    const nominalDiscount = computeNominalDiscount(coupon, baseFare);
    const actualDiscount = round2(Math.min(baseFare, nominalDiscount));
    const finalFare = round2(Math.max(0, baseFare - actualDiscount));
    const excessDiscount = round2(Math.max(0, nominalDiscount - actualDiscount));

    // Exactly-once gate: only the caller that flips settled false -> true proceeds.
    if (claim) {
        const markQuery = CouponUsage.findOneAndUpdate(
            { _id: claim._id, settled: { $ne: true } },
            { $set: { settled: true, discountAmount: actualDiscount, excessDiscount } },
            { new: true, ...(session ? { session } : {}) },
        );
        const marked = await markQuery;
        if (!marked) {
            return { alreadySettled: true, usage: claim, excessCredited: claim.excessDiscount || 0 };
        }
        claim = marked;
    } else {
        // Legacy ride with a coupon but no reservation row.
        try {
            const [created] = await CouponUsage.create([{
                couponId: coupon._id,
                userId: ride.user,
                rideId: ride._id,
                discountAmount: actualDiscount,
                excessDiscount,
                settled: true,
            }], session ? { session } : {});
            claim = created;
        } catch (err) {
            if (err?.code === 11000) {
                const dupQuery = CouponUsage.findOne({ rideId });
                if (session) dupQuery.session(session);
                claim = await dupQuery;
                return { alreadySettled: true, usage: claim, excessCredited: claim?.excessDiscount || 0 };
            }
            throw err;
        }
    }

    // Increment the global counter once, respecting usageLimit when defined.
    const incrementOptions = session ? { session } : {};
    await Coupon.findOneAndUpdate(
        {
            code: coupon.code,
            $or: [
                { usageLimit: null },
                { usageLimit: { $lte: 0 } },
                { $expr: { $lt: ['$usedCount', '$usageLimit'] } },
            ],
        },
        { $inc: { usedCount: 1 } },
        incrementOptions,
    );

    // Keep the ride snapshot consistent with the redemption.
    await rideModel.updateOne(
        { _id: ride._id },
        { $set: { discountAmount: actualDiscount, chargedAmount: finalFare, finalFare, originalFare: baseFare, discountReason: coupon.code } },
        incrementOptions,
    );

    // Excess discount -> wallet credit (idempotent via the unique ledger reference).
    let excessCredited = 0;
    if (excessDiscount > 0 && coupon.creditExcessToWallet) {
        const reference = `coupon_excess_${ride._id}`;
        const txQuery = WalletTransaction.findOne({ reference });
        if (session) txQuery.session(session);
        if (!(await txQuery)) {
            await userModel.updateOne(
                { _id: ride.user },
                { $inc: { walletBalance: excessDiscount } },
                incrementOptions,
            );
            await WalletTransaction.create([{
                userId: ride.user,
                rideId: ride._id,
                amount: excessDiscount,
                direction: 'credit',
                status: 'success',
                reference,
                description: `Excess coupon credit from ${coupon.code}`,
            }], session ? { session } : {});
            excessCredited = excessDiscount;
        }
    }

    return {
        alreadySettled: false,
        usage: claim,
        coupon,
        actualDiscount,
        finalFare,
        excessDiscount,
        excessCredited,
    };
}

module.exports = { listAvailableCoupons, validateCoupon, reserveCoupon, releaseCoupon, releaseStaleCouponReservations, settleCouponRedemption, normalizeCoupon };
