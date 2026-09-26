const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
    {
        // Driver this verification document belongs to.
        driverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'captain',
            required: true,
            index: true,
        },

        // Document category.
        type: {
            type: String,
            required: true,
            enum: [
                'license',
                'RC',
                'insurance',
                'ID',
            ],
        },

        // Secure storage location for the uploaded document.
        fileUrl: {
            type: String,
            required: true,
            trim: true,
        },

        // Admin verification state.
        verificationStatus: {
            type: String,
            enum: [
                'pending',
                'approved',
                'rejected',
            ],
            default: 'pending',
            index: true,
        },

        // Optional reason when an admin rejects a document.
        rejectionReason: {
            type: String,
            maxlength: 500,
            default: '',
            trim: true,
        },

        // Time when the document was uploaded.
        uploadedAt: {
            type: Date,
            default: Date.now,
        },

        // Time when admin approved/rejected the document.
        verifiedAt: {
            type: Date,
            default: null,
        },

        // Admin who performed the verification.
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'admin',
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'documents',
    }
);

// Driver document lookup.
documentSchema.index(
    { driverId: 1 },
    { name: 'driverId_1_pdf' }
);

// Useful for admin verification queues.
documentSchema.index(
    { verificationStatus: 1, uploadedAt: -1 },
    { name: 'verificationStatus_1_uploadedAt_-1_pdf' }
);

// Prevent duplicate copies of the same document type
// for the same driver.
documentSchema.index(
    { driverId: 1, type: 1 },
    {
        unique: true,
        name: 'driverId_1_type_1_unique',
    }
);

module.exports = mongoose.model('Document', documentSchema);