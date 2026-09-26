const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'admin', default: null, index: true },
    action: { type: String, required: true, index: true },
    targetType: {
        type: String,
        enum: ['user', 'driver', 'captain', 'ride', 'pricing', 'subscription', 'refund', 'config', 'support_ticket', 'other'],
        required: true,
        index: true,
    },
    targetId: { type: String, default: null },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    timestamp: { type: Date, default: Date.now, index: true },
}, { timestamps: true, collection: 'audit_logs' });

auditLogSchema.index({ action: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
