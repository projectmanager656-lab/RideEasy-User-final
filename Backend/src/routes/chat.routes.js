const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const chatController = require('../controllers/chat.controller');
const auth = require('../middlewares/auth.middleware');

const router = express.Router();

/** Chat is user-initiated, so it gets its own per-passenger limit on top of the global API limiter. */
const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.CHAT_RATE_MAX || 20),
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.RATE_LIMIT_DISABLED === 'true',
    keyGenerator: (req) => `chat:${req.userId || req.ip}`,
    handler: (req, res, _next, options) => {
        res.status(options.statusCode).json({
            success: false,
            ok: false,
            error: 'Too many messages. Please wait a moment and try again.',
            message: 'Too many messages. Please wait a moment and try again.',
            code: 'HTTP_429',
            requestId: req.requestId,
        });
    },
});

router.post('/',
    auth.authUser,
    chatLimiter,
    body('message').isString().trim().isLength({ min: 1, max: 1000 }),
    body('language').optional().isIn([ 'en', 'hi', 'mr' ]),
    body('history').optional().isArray({ max: 20 }),
    body('history.*.role').optional().isIn([ 'user', 'assistant' ]),
    body('history.*.content').optional().isString().isLength({ max: 2000 }),
    chatController.postChat
);

module.exports = router;
