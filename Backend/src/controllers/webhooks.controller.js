const crypto = require('crypto');

/** Body must be raw Buffer (mount with express.raw before express.json) */
module.exports.razorpayWebhook = (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
        console.warn('RAZORPAY_WEBHOOK_SECRET not set');
        return res.status(501).json({ message: 'Webhook not configured' });
    }

    const sig = req.headers['x-razorpay-signature'];
    const body = req.body;
    if (!Buffer.isBuffer(body)) {
        return res.status(400).json({ message: 'Expected raw body' });
    }

    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    if (!sig || sig !== expected) {
        return res.status(400).json({ message: 'Invalid signature' });
    }

    let payload;
    try {
        payload = JSON.parse(body.toString('utf8'));
    } catch {
        return res.status(400).json({ message: 'Invalid JSON' });
    }

    // TODO: switch (payload.event) { case 'payment.captured': ... }
    return res.json({ received: true });
};
