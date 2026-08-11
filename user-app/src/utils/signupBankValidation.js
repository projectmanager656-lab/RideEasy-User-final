/**
 * Client checks aligned with backend verifyBankDetails — Marathi + English hints.
 */
export function signupBankClientError ({ accountHolderName, accountNumber, ifscCode, upiId }) {
  const holder = String(accountHolderName || '').trim()
  const account = String(accountNumber || '').replace(/\s+/g, '')
  const ifsc = String(ifscCode || '').trim().toUpperCase()
  const upi = String(upiId || '').trim().toLowerCase()
  if (holder.length < 2) {
    return 'खातेदाराचे पूर्ण नाव टाका (किमान २ अक्षरे). Enter account holder name (min 2 characters).'
  }
  if (!/^\d{9,18}$/.test(account)) {
    return 'बँक खाते क्रमांक ९ ते १८ अंकांचा असावा. Account number must be 9–18 digits.'
  }
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    return 'बरोबर IFSC टाका (उदा. HDFC0001234). Enter a valid IFSC code.'
  }
  if (!/^[a-z0-9.\-_]{2,}@[a-z]{2,}$/.test(upi)) {
    return 'बरोबर UPI ID टाका (उदा. नाव@okaxis). Enter a valid UPI ID.'
  }
  return null
}
