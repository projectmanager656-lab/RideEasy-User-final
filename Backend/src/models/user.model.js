const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { signPayload } = require('../config/jwt.config');

const userSchema = new mongoose.Schema({
     name: { type: String, required: true, minlength: 2 },
     phone: { type: String, required: true },
     email: { type: String, required: true, unique: true, lowercase: true },
     city: { type: String, enum: [ 'Kolhapur', 'Ichalkaranji', 'Sangli' ], default: 'Kolhapur' },
     /** Quick picks on the booking screen (home / work). */
     savedAddresses: {
         home: { type: String, default: '' },
         work: { type: String, default: '' },
     },
     bankDetails: {
         accountHolderName: { type: String, default: '' },
         accountNumber: { type: String, default: '' },
         ifscCode: { type: String, default: '' },
         upiId: { type: String, default: '' },
         verified: { type: Boolean, default: false },
         verifiedAt: { type: Date, default: null },
     },
     /** Emergency contact information */
     emergencyContact: {
         name: { type: String, default: '' },
         phone: { type: String, default: '' },
         relationship: { type: String, default: '' },
     },
     password: { type: String, required: true, select: false },
     socketId: { type: String },
     walletBalance: { type: Number, default: 0 },
     referralCode: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
     referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'user', default: null },
     referralOfferEligible: { type: Boolean, default: false },
     referralOfferUsed: { type: Boolean, default: false },
     referralOfferUsedAt: { type: Date, default: null },
     referralOfferAppliedRide: { type: mongoose.Schema.Types.ObjectId, ref: 'ride', default: null },
     blocked: { type: Boolean, default: false },
     loginOtp: { type: String, select: false },
     loginOtpExpiresAt: { type: Date, select: false },
 }, { timestamps: true, collection: 'users' });

userSchema.methods.generateAuthToken = function () {
    return signPayload({ _id: this._id, role: 'user' });
};

userSchema.methods.comparePassword = async function (password) {
    try {
        if (password == null || typeof password !== 'string' || !this.password) return false;
        return await bcrypt.compare(password, this.password);
    } catch (err) {
        console.error('[user] comparePassword error:', err.message);
        return false;
    }
};

userSchema.statics.hashPassword = async function (password) {
    return await bcrypt.hash(password, 10);
};

module.exports = mongoose.model('user', userSchema);

