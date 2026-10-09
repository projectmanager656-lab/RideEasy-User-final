/**
 * SMS dispatch — provider-agnostic adapter, credentials live ONLY in Backend env.
 *
 * Currently supports an MSG91-style HTTP API (the common Indian transactional-SMS
 * shape). Activate by setting in Backend/.env:
 *
 *   SMS_API_KEY=...        (provider auth key)
 *   SMS_SENDER_ID=...      (approved sender/DLT id)
 *   SMS_API_URL=...        (optional; defaults to the MSG91 campaign endpoint)
 *
 * With no env configured the module is a safe no-op: callers record
 * `{ sent: false, error: 'sms_not_configured' }` and the ride flow continues.
 * This module NEVER throws — SMS failure must not fail ride APIs.
 */

const DEFAULT_SMS_API_URL = 'https://api.msg91.com/api/v5/flow/';

function isConfigured () {
    return Boolean(process.env.SMS_API_KEY && process.env.SMS_SENDER_ID);
}

/**
 * Send one SMS. Resolves `{ sent: boolean, error?: string }` — never rejects.
 */
async function sendSms ({ phone, message }) {
    if (!phone || !message) return { sent: false, error: 'sms_invalid_input' };
    if (!isConfigured()) return { sent: false, error: 'sms_not_configured' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
        const url = process.env.SMS_API_URL || DEFAULT_SMS_API_URL;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                authkey: process.env.SMS_API_KEY,
            },
            body: JSON.stringify({
                template_id: process.env.SMS_TEMPLATE_ID || undefined,
                short_url: '0',
                recipients: [
                    { mobiles: String(phone).replace(/[^\d+]/g, ''), MESSAGE: message },
                ],
                sender: process.env.SMS_SENDER_ID,
                message,
            }),
            signal: controller.signal,
        });
        if (!res.ok) {
            return { sent: false, error: `sms_provider_status_${res.status}` };
        }
        const body = await res.json().catch(() => null);
        // MSG91 returns { type: 'success' | 'error', ... } — treat non-success as failure.
        if (body && body.type && body.type !== 'success') {
            return { sent: false, error: `sms_provider_error${body.message ? `: ${body.message}` : ''}` };
        }
        return { sent: true };
    } catch (err) {
        const reason = err?.name === 'AbortError' ? 'sms_provider_timeout' : (err?.message || 'sms_provider_unavailable');
        return { sent: false, error: String(reason).slice(0, 200) };
    } finally {
        clearTimeout(timer);
    }
}

module.exports = { sendSms, isConfigured };
