/**
 * Central structured logging — swap for Winston/Pino later without changing call sites.
 */
const LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const order = { error: 0, warn: 1, info: 2, debug: 3 };

function shouldLog (level) {
    return order[level] <= order[LEVEL];
}

function fmt (scope, msg, extra) {
    const ts = new Date().toISOString();
    const base = `[${ts}] [${scope}] ${msg}`;
    if (extra !== undefined && extra !== null && typeof extra === 'object') {
        try {
            return `${base} ${JSON.stringify(extra)}`;
        } catch {
            return `${base} [object]`;
        }
    }
    return extra !== undefined ? `${base} ${extra}` : base;
}

function api (msg, extra) {
    if (shouldLog('info')) console.log(fmt('api', msg, extra));
}

function socket (msg, extra) {
    if (shouldLog('debug')) console.log(fmt('socket', msg, extra));
}

function ride (msg, extra) {
    if (shouldLog('info')) console.log(fmt('ride', msg, extra));
}

function payment (msg, extra) {
    if (shouldLog('info')) console.log(fmt('payment', msg, extra));
}

function warn (msg, extra) {
    if (shouldLog('warn')) console.warn(fmt('app', msg, extra));
}

function error (msg, extra) {
    if (shouldLog('error')) console.error(fmt('app', msg, extra));
}

module.exports = {
    api,
    socket,
    ride,
    payment,
    warn,
    error,
    debug: (msg, extra) => {
        if (shouldLog('debug')) console.log(fmt('debug', msg, extra));
    },
};
