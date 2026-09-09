const jwt = require('jsonwebtoken');

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const VALID_ISS = [ 'accounts.google.com', 'https://accounts.google.com' ];

let cachedCerts = null;
let cachedCertsAt = 0;
const CERTS_TTL_MS = 60 * 60 * 1000;

async function fetchGoogleCerts() {
    if (cachedCerts && Date.now() - cachedCertsAt < CERTS_TTL_MS) {
        return cachedCerts;
    }
    const res = await fetch(CERTS_URL);
    if (!res.ok) throw new Error('Failed to fetch Google certs');
    const body = await res.json();
    cachedCerts = body.keys || [];
    cachedCertsAt = Date.now();
    return cachedCerts;
}

/**
 * Verifies a Google-signed ID token (RS256) and returns its payload.
 * When GOOGLE_CLIENT_ID is configured the audience is enforced; otherwise a
 * warning is logged (dev convenience) — signature + issuer + email_verified
 * are always enforced.
 */
async function verifyGoogleIdToken(idToken) {
    const header = jwt.decode(idToken, { complete: true })?.header;
    if (!header || header.alg !== 'RS256' || !header.kid) {
        throw new Error('Invalid Google ID token header');
    }

    const keys = await fetchGoogleCerts();
    const key = keys.find((k) => k.kid === header.kid && k.alg === 'RS256');
    if (!key) throw new Error('Google signing key not found');

    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const payload = jwt.verify(idToken, key, { algorithms: [ 'RS256' ] });

    if (!VALID_ISS.includes(payload.iss)) {
        throw new Error('Invalid Google token issuer');
    }
    if (payload.email_verified !== true) {
        throw new Error('Google email not verified');
    }
    if (clientId && payload.aud !== clientId) {
        throw new Error('Google token audience mismatch');
    }
    if (!clientId) {
        console.warn('[users/google] GOOGLE_CLIENT_ID not set — audience check skipped');
    }
    if (!payload.email || !payload.sub) {
        throw new Error('Google token missing email/sub');
    }
    return payload;
}

module.exports = { verifyGoogleIdToken };