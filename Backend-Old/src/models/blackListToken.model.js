const mongoose = require('mongoose');

const blackListTokenSchema = new mongoose.Schema({
    token: { type: String, required: true, index: true },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 7 } // auto-expire in 7 days
});

module.exports = mongoose.model('blackListToken', blackListTokenSchema);

