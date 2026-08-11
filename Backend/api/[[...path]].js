const serverlessHttp = require('serverless-http');

// Express app (includes routes + middleware).
// Note: Socket.IO is NOT initialized in serverless runtime.
const app = require('../src/app');

const handler = serverlessHttp(app);

module.exports = (req, res) => {
    // In Vercel, this file runs under `/api/*`.
    // Our Express app expects routes like `/users/...`, not `/api/users/...`.
    if (typeof req?.url === 'string' && req.url.startsWith('/api/')) {
        req.url = req.url.replace(/^\/api/, '');
    } else if (req?.url === '/api') {
        req.url = '/';
    }
    return handler(req, res);
};

