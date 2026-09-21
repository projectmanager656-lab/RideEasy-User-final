const AuditLog = require('../models/auditLog.model');

async function logAdminAction({
    adminId,
    action,
    targetType,
    targetId = null,
    oldValue = null,
    newValue = null,
    req = null,
}) {
    try {
        const ip = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '') : '';
        const userAgent = req ? (req.headers['user-agent'] || '') : '';
        
        // Sanitize: never log passwords, tokens, secrets
        const sanitize = (val) => {
            if (!val || typeof val !== 'object') return val;
            const copy = JSON.parse(JSON.stringify(val));
            const sensitiveKeys = ['password', 'token', 'jwt', 'otp', 'secret', 'loginOtp', 'otpHash', 'otpCipher'];
            const redact = (obj) => {
                for (const k of Object.keys(obj)) {
                    if (sensitiveKeys.some((s) => k.toLowerCase().includes(s))) {
                        obj[k] = '[REDACTED]';
                    } else if (obj[k] && typeof obj[k] === 'object') {
                        redact(obj[k]);
                    }
                }
            };
            redact(copy);
            return copy;
        };

        return await AuditLog.create({
            adminId,
            action,
            targetType,
            targetId: targetId ? String(targetId) : null,
            oldValue: sanitize(oldValue),
            newValue: sanitize(newValue),
            ip: String(ip).slice(0, 100),
            userAgent: String(userAgent).slice(0, 300),
            timestamp: new Date(),
        });
    } catch (e) {
        console.warn('[auditLog] failed to write audit log:', e?.message || e);
        return null;
    }
}

module.exports = {
    logAdminAction,
};
