const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
    {
        // Existing captain.model.js represents the drivers collection.
        driverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'captain',
            required: true,
        },

        // Keep the same vehicle values already used by the existing backend.
        type: {
            type: String,
            required: true,
            enum: ['BIKE', 'AUTO', 'CAR'],
        },

        make: {
            type: String,
            trim: true,
            default: '',
        },

        model: {
            type: String,
            trim: true,
            default: '',
        },

        registrationNumber: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
        },

        color: {
            type: String,
            trim: true,
            default: '',
        },

        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
        },
    },
    {
        timestamps: true,
        collection: 'vehicles',
    }
);

// PDF requirement:
// vehicles.driverId -> drivers._id
vehicleSchema.index({ driverId: 1 });

module.exports = mongoose.model('Vehicle', vehicleSchema);