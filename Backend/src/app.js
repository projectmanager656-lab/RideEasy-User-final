require('dotenv').config();
const { validateEnv, warnDevelopmentEnv } = require('./config/env');
validateEnv();
warnDevelopmentEnv();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { expressCorsOptions, getAllowedOriginsList } = require('./config/cors.config');
const { ensureDbConnected } = require('./config/db');
const { requestContext, requestLogger } = require('./middlewares/requestContext.middleware');
const { errorHandler } = require('./middlewares/errorHandler.middleware');

const userRoutes = require('./routes/user.routes');
const captainRoutes = require('./routes/captain.routes');
const mapsRoutes = require('./routes/maps.routes');
const rideRoutes = require('./routes/ride.routes');
const adminRoutes = require('./routes/admin.routes');
const driverSubscriptionRoutes = require('./routes/driverSubscriptions.routes');
const healthRoutes = require('./routes/health.routes');
const configRoutes = require('./routes/config.routes');
const webhooksController = require('./controllers/webhooks.controller');

const app = express();

app.set('etag', false);
app.set('trust proxy', 1);

const corsOptions = expressCorsOptions();

app.use(requestContext);

if (process.env.REQUEST_LOG_DEBUG === 'true') {
    app.use(requestLogger);
}

// Optional: set CORS_DEBUG=true to log Origin on each request
if (process.env.CORS_DEBUG === 'true') {
    app.use((req, res, next) => {
        console.log('[CORS debug] <=', req.method, req.path, 'Origin:', req.headers.origin || '(none)');
        res.on('finish', () => {
            const acao = res.getHeader('Access-Control-Allow-Origin');
            if (acao) console.log('[CORS debug] => ACAO:', acao);
        });
        next();
    });
}

// CORS before DB gate so JSON errors (503, etc.) still get Access-Control-Allow-Origin
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

/** Mongo for all non-OPTIONS traffic (serverless `api/[[...path]].js` has no server.js bootstrap). */
app.use(async (req, res, next) => {
    if (req.method === 'OPTIONS') {
        return next();
    }
    if (req.path === '/health/live') {
        return next();
    }
    try {
        await ensureDbConnected();
    } catch (err) {
        console.error('[MongoDB] ensureDbConnected:', err?.message || err);
        return res.status(503).json({
            ok: false,
            message: 'Database unavailable',
            requestId: req.requestId,
        });
    }
    return next();
});

// Optional HTTPS enforcement (useful behind reverse proxies/load balancers)
if (process.env.FORCE_HTTPS === 'true') {
    app.use((req, res, next) => {
        if (req.secure) return next();
        const host = req.headers.host;
        if (!host) return next();
        return res.redirect(301, `https://${host}${req.originalUrl}`);
    });
}

// Optional error monitoring (Sentry)
let Sentry = null;
try {
    Sentry = require('@sentry/node');
} catch (e) {
    Sentry = null;
}
if (Sentry?.init && process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    });

    if (Sentry.Handlers?.requestHandler) {
        app.use(Sentry.Handlers.requestHandler());
    }
    if (Sentry.Handlers?.tracingHandler) {
        app.use(Sentry.Handlers.tracingHandler());
    }
}

/** Razorpay needs raw body for signature — before express.json() */
app.post('/webhooks/razorpay', express.raw({ type: 'application/json', limit: '256kb' }), webhooksController.razorpayWebhook);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const isProdLike = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
/** Admin UI + React dev fire many requests; rate-limit is off locally unless NODE_ENV=production. */
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX || 2000),
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => {
        if (process.env.RATE_LIMIT_DISABLED === 'true') {
            return true;
        }
        return !isProdLike;
    },
    handler: (req, res, _next, options) => {
        res.status(options.statusCode).json({
            ok: false,
            message: 'Too many requests',
            requestId: req.requestId,
        });
    },
});
app.use(apiLimiter);

if (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') {
    console.log('[CORS] allowed origins (env + fallback):', getAllowedOriginsList());
}

app.get('/', (req, res) => res.json({ ok: true, status: 'ok', requestId: req.requestId }));
app.use('/health', healthRoutes);
app.use('/config', configRoutes);
app.use('/api/config', configRoutes);

app.use('/users', userRoutes);
app.use('/captains', captainRoutes);
app.use('/maps', mapsRoutes);
app.use('/api/maps', mapsRoutes);
app.use('/rides', rideRoutes);
/** Optional `/api/*` aliases (same handlers) for clients expecting an `/api` prefix. */
app.use('/api/users', userRoutes);
app.use('/api/captains', captainRoutes);
app.use('/api/rides', rideRoutes);
app.use('/admin', adminRoutes);
app.use('/api/admin', adminRoutes);
app.use('/driver-subscriptions', driverSubscriptionRoutes);

/** JSON 404 for unknown paths (REST + Socket.IO paths are handled elsewhere). */
app.use((req, res) => {
    res.status(404).json({
        ok: false,
        message: 'Not found',
        path: req.originalUrl,
        requestId: req.requestId,
    });
});

if (Sentry?.Handlers?.errorHandler) {
    app.use(Sentry.Handlers.errorHandler());
}
app.use(errorHandler);

module.exports = app;
