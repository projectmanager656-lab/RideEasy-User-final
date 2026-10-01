const { validationResult } = require('express-validator');
const supportTicketService = require('../services/supportTicket.service');
const { ok, fail } = require('../utils/apiResponse');

module.exports.createTicket = async (req, res) => {
    try {
        const { rideId, category, subject, description, priority } = req.body || {};
        const userId = req.user?._id;
        if (!userId) return fail(res, req, 401, 'Unauthorized');

        const ticket = await supportTicketService.createTicket({
            userId,
            rideId,
            category,
            subject,
            description,
            priority,
        });

        return ok(res, req, 201, 'Support ticket created', { ticket });
    } catch (err) {
        return fail(res, req, err.statusCode || 500, err.message || 'Failed to create support ticket');
    }
};

module.exports.getMyTickets = async (req, res) => {
    try {
        const userId = req.user?._id;
        if (!userId) return fail(res, req, 401, 'Unauthorized');
        const tickets = await supportTicketService.listUserTickets(userId);
        return ok(res, req, 200, 'Support tickets fetched', { tickets });
    } catch (err) {
        return fail(res, req, 500, err.message || 'Failed to fetch tickets');
    }
};

module.exports.getTicketById = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { id } = req.params;
        const ticket = await supportTicketService.getUserTicketById(id, userId);
        return ok(res, req, 200, 'Support ticket fetched', { ticket });
    } catch (err) {
        return fail(res, req, err.statusCode || 500, err.message || 'Failed to fetch ticket');
    }
};

module.exports.replyTicket = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { id } = req.params;
        const { message } = req.body || {};
        if (!message) return fail(res, req, 400, 'Message is required');

        await supportTicketService.getUserTicketById(id, userId); // check ownership
        const ticket = await supportTicketService.addTicketReply({
            ticketId: id,
            senderRole: 'user',
            senderId: userId,
            message,
        });
        return ok(res, req, 200, 'Reply added', { ticket });
    } catch (err) {
        return fail(res, req, err.statusCode || 500, err.message || 'Failed to add reply');
    }
};
