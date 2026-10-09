const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

/** Load balancers / uptime monitors — no auth, no DB required */
router.get('/live', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'live', uptimeSec: Math.floor(process.uptime()) });
});

/** Kubernetes-style readiness — Mongo connected */
router.get('/ready', (req, res) => {
    const ok = mongoose.connection.readyState === 1;
    res.set('Cache-Control', 'no-store');
    res.status(ok ? 200 : 503).json({
        status: ok ? 'ready' : 'not_ready',
        mongo: ok ? 'connected' : 'disconnected',
    });
});

module.exports = router;
