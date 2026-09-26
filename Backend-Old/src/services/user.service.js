/**
 * User domain — thin helpers; controllers remain source of truth until incremental extraction.
 */
const userModel = require('../models/user.model');

async function findById (id, projection) {
    return userModel.findById(id, projection);
}

module.exports = {
    findById,
};
