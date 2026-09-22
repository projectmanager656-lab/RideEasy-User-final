const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema(
    {
        // Ticket creator. The PDF calls this userId even though
        // the creator can be a customer or driver.
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },

        // Optional ride related to the support issue.
        rideId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ride',
            default: null,
        },

        category: {
            type: String,
            enum: ['Payment', 'ride', 'account', 'other'],
            required: true,
        },

        subject: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },

        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 5000,
        },

        status: {
            type: String,
            enum: ['open', 'inProgress', 'resolved'],
            default: 'open',
            index: true,
        },
    },
    {
        timestamps: true,
        collection: 'supportTickets',
    }
);

// Existing PDF/database index.
supportTicketSchema.index(
    { userId: 1, createdAt: -1 },
    { name: 'userId_1_createdAt_-1_pdf' }
);

module.exports = mongoose.model('SupportTicket', supportTicketSchema);