const SupportTicket = require('../models/supportTicket.model');
const crypto = require('crypto');

function generateTicketNumber() {
    return `TCK-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

async function createTicket({ userId, rideId, category, subject, description, priority = 'medium' }) {
    if (!userId || !subject || !description) {
        const error = new Error('User, subject, and description are required');
        error.statusCode = 400;
        throw error;
    }

    const ticket = await SupportTicket.create({
        ticketNumber: generateTicketNumber(),
        userId,
        rideId: rideId || null,
        category: category || 'other',
        subject,
        description,
        priority,
        status: 'open',
        responses: [
            {
                senderRole: 'user',
                senderId: userId,
                message: description,
                createdAt: new Date(),
            },
        ],
    });

    return ticket;
}

async function listUserTickets(userId, { limit = 50 } = {}) {
    return SupportTicket.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
}

async function getUserTicketById(ticketId, userId) {
    const ticket = await SupportTicket.findOne({ _id: ticketId, userId });
    if (!ticket) {
        const error = new Error('Ticket not found');
        error.statusCode = 404;
        throw error;
    }
    return ticket;
}

async function addTicketReply({ ticketId, senderRole, senderId, message }) {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
        const error = new Error('Ticket not found');
        error.statusCode = 404;
        throw error;
    }

    ticket.responses.push({
        senderRole,
        senderId,
        message,
        createdAt: new Date(),
    });

    if (senderRole === 'admin' && ticket.status === 'open') {
        ticket.status = 'in_progress';
    }

    return ticket.save();
}

module.exports = {
    createTicket,
    listUserTickets,
    getUserTicketById,
    addTicketReply,
};
