const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
    ticketNumber: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true, index: true },
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'ride', default: null, index: true },
    category: { type: String, default: 'other' },
    subject: { type: String, required: true },
    description: { type: String, required: true },
    status: {
        type: String,
        enum: ['open', 'in_progress', 'resolved', 'closed'],
        default: 'open',
        index: true,
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium',
    },
    assignedAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'admin', default: null },
    responses: [
        {
            senderRole: { type: String, enum: ['user', 'admin', 'system'], default: 'user' },
            senderId: { type: mongoose.Schema.Types.ObjectId, default: null },
            message: { type: String, required: true },
            createdAt: { type: Date, default: Date.now },
        },
    ],
}, { timestamps: true, collection: 'support_tickets' });

supportTicketSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
