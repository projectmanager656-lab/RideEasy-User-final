/**
 * httpOnly auth cookie — cross-site (frontend on another host) needs SameSite=None; Secure in production.
 */
function getAuthCookieOptions() {
    const prod = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        path: '/',
        secure: prod,
        sameSite: prod ? 'none' : 'lax',
    };
}

module.exports = { getAuthCookieOptions };
