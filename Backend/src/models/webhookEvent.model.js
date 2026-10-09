const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
    eventId: { type: String, required: true, unique: true, index: true },
    provider: { type: String, default: 'razorpay' },
    eventType: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed },
    processedAt: { type: Date, default: Date.now },
}, { timestamps: true, collection: 'webhook_events' });

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
