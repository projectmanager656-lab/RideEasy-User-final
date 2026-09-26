const express = require('express');

const supportTicketController = require('../controllers/supportTicket.controller');
const auth = require('../middlewares/auth.middleware');

const router = express.Router();

/*
 * Customer / Captain
 * Create a new support ticket.
 */
router.post(
    '/',
    auth.authUserOrCaptain,
    supportTicketController.createTicket
);

/*
 * Customer / Captain:
 *   returns their own tickets.
 *
 * Admin:
 *   returns all tickets.
 */
router.get(
    '/',
    auth.authUserOrCaptain,
    supportTicketController.getTickets
);

router.get(
    '/admin',
    auth.authAdmin,
    supportTicketController.getTickets
);

/*
 * Customer / Captain:
 *   can view their own ticket.
 *
 * Admin:
 *   can view any ticket.
 */
router.get(
    '/:id',
    auth.authUserOrCaptain,
    supportTicketController.getTicketById
);

router.get(
    '/admin/:id',
    auth.authAdmin,
    supportTicketController.getTicketById
);

/*
 * Admin-only ticket status update.
 */
router.patch(
    '/admin/:id/status',
    auth.authAdmin,
    supportTicketController.updateTicketStatus
);

module.exports = router;