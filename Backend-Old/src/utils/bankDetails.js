/**
 * Shared validation for user + driver bank / UPI payout details.
 */
function verifyBankDetails ({ accountHolderName, accountNumber, ifscCode, upiId }) {
    const holder = String(accountHolderName || '').trim();
    const account = String(accountNumber || '').replace(/\s+/g, '');
    const ifsc = String(ifscCode || '').trim().toUpperCase();
    const upi = String(upiId || '').trim().toLowerCase();

    if (holder.length < 2) return { ok: false, message: 'Account holder name is required' };
    if (!/^\d{9,18}$/.test(account)) return { ok: false, message: 'Invalid account number' };
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return { ok: false, message: 'Invalid IFSC code' };
    if (!/^[a-z0-9.\-_]{2,}@[a-z]{2,}$/.test(upi)) return { ok: false, message: 'Invalid UPI ID' };

    return {
        ok: true,
        normalized: {
            accountHolderName: holder,
            accountNumber: account,
            ifscCode: ifsc,
            upiId: upi,
            verified: false,
            verifiedAt: null,
        },
    };
}

module.exports = { verifyBankDetails };
