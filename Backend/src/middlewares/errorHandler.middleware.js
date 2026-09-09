function errorHandler(err, req, res, next) {
    const status = Number(err?.status || err?.statusCode || 500);
    const requestId = req?.requestId || 'unknown';

    if (status >= 500) {
        console.error(`[ERR] id=${requestId}`, err);
    } else {
        console.warn(`[ERR] id=${requestId} status=${status} message=${err?.message || 'Request failed'}`);
    }

    if (res.headersSent) {
        return next(err);
    }

    const body = {
        success: false,
        ok: false,
        error: err?.message || 'Internal server error',
        message: err?.message || 'Internal server error',
        code: err?.code || (status >= 500 ? 'INTERNAL_ERROR' : `HTTP_${status}`),
        requestId,
    };
    if (status >= 500 && process.env.NODE_ENV === 'production') {
        body.message = 'Internal server error';
    }
    return res.status(status).json(body);
}

module.exports = { errorHandler };
