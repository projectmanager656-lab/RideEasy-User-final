const mongoose = require('mongoose');

/** Passenger emergency contact rows for the `emergency_contacts` collection. */
const emergencyContactSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
    name: { type: String, required: true, maxlength: 80 },
    phone: { type: String, required: true, maxlength: 20 },
    relationship: { type: String, default: '', maxlength: 40 },
    isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true, collection: 'emergency_contacts' });

/** Single active contact per passenger. */
emergencyContactSchema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.model('EmergencyContact', emergencyContactSchema);
