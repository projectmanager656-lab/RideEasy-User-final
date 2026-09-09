require('dotenv').config();

const { validateEnv, warnDevelopmentEnv } = require('./config/env');
validateEnv();
warnDevelopmentEnv();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const {
    expressCorsOptions,
    getAllowedOriginsList,
} = require('./config/cors.config');

const { ensureDbConnected } = require('./config/db');

const {
    requestContext,
    requestLogger,
} = require('./middlewares/requestContext.middleware');

const {
    errorHandler,
} = require('./middlewares/errorHandler.middleware');

const userRoutes = require('./routes/user.routes');
const captainRoutes = require('./routes/captain.routes');
const mapsRoutes = require('./routes/maps.routes');
const rideRoutes = require('./routes/ride.routes');
const adminRoutes = require('./routes/admin.routes');
const driverSubscriptionRoutes = require('./routes/driverSubscriptions.routes');
const healthRoutes = require('./routes/health.routes');
const configRoutes = require('./routes/config.routes');
const supportTicketRoutes = require('./routes/supportTicket.routes');

const webhooksController = require('./controllers/webhooks.controller');

const app = express();

/*
 * =========================================================
 * REQUEST CONTEXT
 * =========================================================
 */

app.use(requestContext);

if (process.env.NODE_ENV !== 'test') {
    app.use(requestLogger);
}

/*
 * =========================================================
 * CORS
 * =========================================================
 */

const allowedOrigins = getAllowedOriginsList();
const corsOptions = expressCorsOptions();

app.use(cors(corsOptions));

/*
 * =========================================================
 * DATABASE CONNECTION
 * =========================================================
 */

app.use(async (req, res, next) => {
    try {
        await ensureDbConnected();
        next();
    } catch (error) {
        next(error);
    }
});

/*
 * =========================================================
 * BODY PARSERS
 * =========================================================
 */

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/*
 * =========================================================
 * RATE LIMIT
 * =========================================================
 */

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many requests. Please try again later.',
    },
});

app.use(apiLimiter);

/*
 * =========================================================
 * HEALTH / CONFIG
 * =========================================================
 */

app.use('/health', healthRoutes);

app.use('/config', configRoutes);
app.use('/api/config', configRoutes);

/*
 * =========================================================
 * USER / CAPTAIN / MAP / RIDE ROUTES
 * =========================================================
 */

app.use('/users', userRoutes);
app.use('/captains', captainRoutes);

app.use('/maps', mapsRoutes);
app.use('/api/maps', mapsRoutes);

app.use('/rides', rideRoutes);

/*
 * =========================================================
 * API PREFIX ROUTES
 * =========================================================
 */

app.use('/api/users', userRoutes);
app.use('/api/captains', captainRoutes);
app.use('/api/rides', rideRoutes);

/*
 * =========================================================
 * ADMIN
 * =========================================================
 */

app.use('/admin', adminRoutes);
app.use('/api/admin', adminRoutes);

/*
 * =========================================================
 * DRIVER SUBSCRIPTIONS
 * =========================================================
 */

app.use('/driver-subscriptions', driverSubscriptionRoutes);

/*
 * =========================================================
 * SUPPORT TICKETS
 * =========================================================
 */

app.use('/support-tickets', supportTicketRoutes);
app.use('/api/support-tickets', supportTicketRoutes);

/*
 * =========================================================
 * WEBHOOKS
 * =========================================================
 */

if (webhooksController) {
    if (typeof webhooksController.razorpayWebhook === 'function') {
        app.post(
            '/webhooks/razorpay',
            express.raw({ type: 'application/json' }),
            webhooksController.razorpayWebhook
        );
    }
}

/*
 * =========================================================
 * 404 HANDLER
 * =========================================================
 */

app.use((req, res) => {
    return res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.originalUrl,
    });
});

/*
 * =========================================================
 * ERROR HANDLER
 * =========================================================
 */

app.use(errorHandler);

module.exports = app;