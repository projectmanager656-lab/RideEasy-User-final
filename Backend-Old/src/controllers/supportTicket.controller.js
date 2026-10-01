const mongoose = require('mongoose');
const SupportTicket = require('../models/supportTicket.model');

const ALLOWED_CATEGORIES = ['Payment', 'ride', 'account', 'other'];
const ALLOWED_STATUSES = ['open', 'inProgress', 'resolved'];

function getAuthId(req) {
    return req.authId || req.user?._id || req.captain?._id || req.admin?._id || req.auth?.id || null;
}

function getAuthRole(req) {
    return req.authRole || req.user?.role || req.captain?.role || req.admin?.role || req.auth?.role || null;
}

function isValidObjectId(value) {
    return mongoose.Types.ObjectId.isValid(value);
}

function sendError(res, status, message) {
    return res.status(status).json({
        success: false,
        message,
    });
}

/**
 * POST /support-tickets
 *
 * Customer/captain creates a support ticket.
 */
exports.createTicket = async (req, res, next) => {
    try {
        const userId = getAuthId(req);

        if (!userId) {
            return sendError(res, 401, 'Authentication required');
        }

        const {
            rideId = null,
            category,
            subject,
            description,
        } = req.body || {};

        if (!category || !ALLOWED_CATEGORIES.includes(category)) {
            return sendError(
                res,
                400,
                `category must be one of: ${ALLOWED_CATEGORIES.join(', ')}`
            );
        }

        if (
            typeof subject !== 'string' ||
            subject.trim().length < 2
        ) {
            return sendError(
                res,
                400,
                'subject is required'
            );
        }

        if (
            typeof description !== 'string' ||
            description.trim().length < 2
        ) {
            return sendError(
                res,
                400,
                'description is required'
            );
        }

        if (rideId !== null && !isValidObjectId(rideId)) {
            return sendError(res, 400, 'Invalid rideId');
        }

        const ticket = await SupportTicket.create({
            userId,
            rideId: rideId || null,
            category,
            subject: subject.trim(),
            description: description.trim(),
            status: 'open',
        });

        return res.status(201).json({
            success: true,
            message: 'Support ticket created successfully',
            ticket,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /support-tickets
 *
 * Customer/captain sees only their own tickets.
 * Admin sees all tickets.
 */
exports.getTickets = async (req, res, next) => {
    try {
        const role = getAuthRole(req);
        const userId = getAuthId(req);

        let filter = {};

        if (role === 'admin') {
            filter = {};
        } else {
            if (!userId) {
                return sendError(res, 401, 'Authentication required');
            }

            filter = { userId };
        }

        const tickets = await SupportTicket.find(filter)
            .sort({ createdAt: -1 })
            .lean();

        return res.json({
            success: true,
            count: tickets.length,
            tickets,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /support-tickets/:id
 *
 * Customer/captain can view their own ticket.
 * Admin can view any ticket.
 */
exports.getTicketById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const role = getAuthRole(req);
        const userId = getAuthId(req);

        if (!isValidObjectId(id)) {
            return sendError(res, 400, 'Invalid ticket id');
        }

        const ticket = await SupportTicket.findById(id).lean();

        if (!ticket) {
            return sendError(res, 404, 'Support ticket not found');
        }

        if (role !== 'admin') {
            if (!userId) {
                return sendError(res, 401, 'Authentication required');
            }

            if (String(ticket.userId) !== String(userId)) {
                return sendError(res, 403, 'Forbidden');
            }
        }

        return res.json({
            success: true,
            ticket,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * PATCH /support-tickets/:id/status
 *
 * Admin-only status update.
 */
exports.updateTicketStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body || {};

        if (!isValidObjectId(id)) {
            return sendError(res, 400, 'Invalid ticket id');
        }

        if (!ALLOWED_STATUSES.includes(status)) {
            return sendError(
                res,
                400,
                `status must be one of: ${ALLOWED_STATUSES.join(', ')}`
            );
        }

        const ticket = await SupportTicket.findByIdAndUpdate(
            id,
            { $set: { status } },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!ticket) {
            return sendError(res, 404, 'Support ticket not found');
        }

        return res.json({
            success: true,
            message: 'Support ticket status updated successfully',
            ticket,
        });
    } catch (error) {
        next(error);
    }
};