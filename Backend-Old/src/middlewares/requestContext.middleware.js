const crypto = require('crypto');

function requestContext(req, res, next) {
    const incoming = req.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && incoming.trim()
        ? incoming.trim()
        : crypto.randomUUID();

    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    return next();
}

function requestLogger(req, res, next) {
    const startedAt = Date.now();
    const route = `${req.method} ${req.originalUrl}`;
    console.log(`[REQ] id=${req.requestId} ${route}`);
    res.on('finish', () => {
        const elapsed = Date.now() - startedAt;
        console.log(`[RES] id=${req.requestId} ${route} status=${res.statusCode} ${elapsed}ms`);
    });
    return next();
}

module.exports = {
    requestContext,
    requestLogger,
};
