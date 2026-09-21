const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'ride', required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true, index: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'captain', default: null, index: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentRecord', default: null },
    pickup: { type: String, required: true },
    drop: { type: String, required: true },
    distance: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
    baseFare: { type: Number, default: 0 },
    distanceFare: { type: Number, default: 0 },
    timeFare: { type: Number, default: 0 },
    surge: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    finalAmount: { type: Number, required: true },
    paymentMethod: { type: String, default: 'Cash' },
    paymentReference: { type: String, default: '' },
    issuedDate: { type: Date, default: Date.now },
    breakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: 'invoices' });

invoiceSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
