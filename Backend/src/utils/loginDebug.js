/**
 * Opt-in login request logging (redacts password). Set LOGIN_DEBUG=true in backend/.env.
 */
function logLoginRequestBody(routeLabel, body) {
    if (process.env.LOGIN_DEBUG !== 'true') return;
    const sanitizedBody = { ...(body || {}) };
    if (sanitizedBody.password != null) sanitizedBody.password = '[redacted]';
    console.log(`[${routeLabel}]`, sanitizedBody);
}

module.exports = { logLoginRequestBody };
