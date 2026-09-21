const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const supportTicketController = require('../controllers/supportTicket.controller');

router.post('/', auth.authUser, supportTicketController.createTicket);
router.get('/', auth.authUser, supportTicketController.getMyTickets);
router.get('/my', auth.authUser, supportTicketController.getMyTickets);
router.get('/:id', auth.authUser, supportTicketController.getTicketById);
router.post('/:id/reply', auth.authUser, supportTicketController.replyTicket);

module.exports = router;
