const Invoice = require('../models/invoice.model');
const PaymentRecord = require('../models/paymentRecord.model');
const pricingService = require('./pricing.service');

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function generateInvoiceNumber(rideId) {
    const d = new Date();
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = String(rideId).slice(-6).toUpperCase();
    return `INV-${dateStr}-${suffix}`;
}

async function getOrCreateInvoice(ride) {
    if (!ride?._id) return null;
    const existing = await Invoice.findOne({ rideId: ride._id });
    if (existing) return existing;

    const payment = await PaymentRecord.findOne({
        rideId: ride._id,
        paymentStatus: 'success',
    }).sort({ createdAt: -1 });

    const totalPaid = ride.chargedAmount != null ? num(ride.chargedAmount) : num(ride.price);
    const discount = num(ride.discountAmount);
    const distance = num(ride.distance);
    const duration = num(ride.duration);

    // Compute fee breakdown
    let baseFare = 0;
    let distanceFare = 0;
    let timeFare = 0;
    try {
        const rates = await pricingService.getRates();
        const tier = ride.vehicleType || 'AUTO';
        const rate = rates[tier] || rates.AUTO || { baseFare: 30, perKm: 12, perMin: 1.5 };
        baseFare = num(rate.baseFare);
        distanceFare = Math.round(distance * num(rate.perKm));
        timeFare = Math.round((duration / 60) * num(rate.perMin));
    } catch {
        baseFare = Math.round(totalPaid * 0.4);
        distanceFare = Math.round(totalPaid * 0.5);
        timeFare = Math.round(totalPaid * 0.1);
    }

    const platformFee = ride.platformFee != null ? num(ride.platformFee) : 0;
    const tax = Math.round(totalPaid * 0.05); // 5% GST on transport

    const invoiceNumber = generateInvoiceNumber(ride._id);
    const invoice = await Invoice.create({
        invoiceNumber,
        rideId: ride._id,
        userId: ride.user?._id || ride.user,
        driverId: ride.captain?._id || ride.captain || null,
        paymentId: payment?._id || null,
        pickup: ride.pickupLocation || '',
        drop: ride.dropLocation || '',
        distance,
        duration,
        baseFare,
        distanceFare,
        timeFare,
        surge: 0,
        tax,
        discount,
        finalAmount: totalPaid,
        paymentMethod: ride.paymentMethod || 'Cash',
        paymentReference: payment?.externalRef || '',
        issuedDate: ride.completedAt || new Date(),
        breakdown: {
            platformFee,
            captainNetEarning: ride.captainNetEarning != null ? num(ride.captainNetEarning) : Math.max(0, totalPaid - platformFee),
        },
    });

    return invoice;
}

module.exports = {
    getOrCreateInvoice,
    generateInvoiceNumber,
};
