import * as Sentry from '@sentry/react';

/**
 * Error monitoring (Sentry).
 * - Enable by setting `VITE_SENTRY_DSN` in `frontend/.env` (build-time).
 * - Keeping it minimal on purpose; tracing/APM can be enabled later.
 */
export function initSentry() {
    const dsn = import.meta.env.VITE_SENTRY_DSN;
    if (!dsn) return;

    Sentry.init({
        dsn,
        environment: import.meta.env.MODE || 'development',
        // Tracing/APM can be configured later if you need performance monitoring.
        tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0),
    });
}
