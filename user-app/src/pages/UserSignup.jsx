import React, { useState, useContext, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { UserDataContext } from '../context/UserContext'
import { apiClient } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { stripApiEnvelope } from '../utils/apiBody'
import { signupBankClientError } from '../utils/signupBankValidation'

const UserSignup = () => {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [city, setCity] = useState('Kolhapur')
  const [password, setPassword] = useState('')
  const [accountHolderName, setAccountHolderName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [ifscCode, setIfscCode] = useState('')
  const [upiId, setUpiId] = useState('')
  const [referredByCode, setReferredByCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const { setSession, authLoading, token } = useContext(UserDataContext)

  useEffect(() => {
    if (authLoading) return
    if (token) {
      navigate('/home', { replace: true })
    }
  }, [ authLoading, token, navigate ])

  const submitHandler = async (e) => {
    e.preventDefault()
    setFormError('')
    const bankErr = signupBankClientError({
      accountHolderName,
      accountNumber,
      ifscCode,
      upiId,
    })
    if (bankErr) {
      setFormError(bankErr)
      return
    }
    try {
      setLoading(true)
      const ref = String(referredByCode || '').trim().toUpperCase()
      const acct = String(accountNumber || '').replace(/\s+/g, '')
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        email: String(email || '').trim().toLowerCase(),
        city: city || 'Kolhapur',
        password,
        bankDetails: {
          accountHolderName: accountHolderName.trim(),
          accountNumber: acct,
          ifscCode: ifscCode.trim().toUpperCase(),
          upiId: upiId.trim().toLowerCase(),
        },
      }
      if (ref) payload.referredByCode = ref
      const response = await apiClient.post('/users/register', payload)
      if (response.status === 201 || response.status === 200) {
        const data = stripApiEnvelope(response.data)
        const user = data?.user ?? data
        const token = data?.token
        if (user && token) {
          setSession(token, user)
          navigate('/home', { replace: true, state: location?.state })
          setName('')
          setPhone('')
          setEmail('')
          setPassword('')
          setAccountHolderName('')
          setAccountNumber('')
          setIfscCode('')
          setUpiId('')
          setReferredByCode('')
        } else {
          setFormError('Registration response missing user or token.')
        }
      }
    } catch (error) {
      setFormError(formatApiError(error))
    } finally {
      setLoading(false)
    }
  }

  const field = 'mb-4 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-base text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-3 p-6">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500"
          aria-hidden
        />
        <p className="text-sm text-zinc-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 pb-24">
      <div className="mx-auto max-w-md">
        <Link to="/login" className="mb-6 inline-block">
          <span className="text-2xl font-bold text-emerald-400">RideEasy</span>
        </Link>
        <form onSubmit={submitHandler} className="rounded-2xl border border-zinc-800 bg-zinc-950/90 p-6 shadow-xl">
          {formError ? (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200 whitespace-pre-line"
            >
              {formError}
            </div>
          ) : null}
          <h3 className="mb-2 text-sm font-medium text-zinc-400">Your name</h3>
          <input
            required
            minLength={2}
            className={field}
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <h3 className="mb-2 text-sm font-medium text-zinc-400">Phone</h3>
          <input
            required
            className={field}
            type="tel"
            placeholder="10-digit mobile"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <h3 className="mb-2 text-sm font-medium text-zinc-400">City</h3>
          <select value={city} onChange={(e) => setCity(e.target.value)} className={`${field} mb-4`}>
            <option value="Kolhapur">Kolhapur</option>
            <option value="Ichalkaranji">Ichalkaranji</option>
            <option value="Sangli">Sangli</option>
          </select>
          <h3 className="mb-2 text-sm font-medium text-zinc-400">Email</h3>
          <input
            required
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
          <div className="mb-6 rounded-xl border-2 border-emerald-600/40 bg-zinc-900/70 p-4 ring-1 ring-emerald-500/20">
            <h3 className="mb-1 text-base font-semibold text-emerald-300">बँक तपशील (साइनअपसाठी आवश्यक)</h3>
            <p className="mb-3 text-xs text-zinc-400 leading-relaxed">
              खाली चारही फील्ड भरा — खातेदाराचे नाव, खाते क्रमांक, IFSC, UPI. हे तपशील राइड पेमेंट / वेरिफिकेशनसाठी वापरले जातात.
            </p>
            <input
              required
              minLength={2}
              className={`${field} mb-3`}
              type="text"
              placeholder="खातेदाराचे नाव / Account holder name"
              value={accountHolderName}
              onChange={(e) => setAccountHolderName(e.target.value)}
            />
            <input
              required
              minLength={9}
              maxLength={18}
              className={`${field} mb-3`}
              type="text"
              inputMode="numeric"
              placeholder="खाते क्रमांक / Account number (9–18 अंक)"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
            />
            <input
              required
              minLength={11}
              maxLength={11}
              className={`${field} mb-3 uppercase`}
              type="text"
              placeholder="IFSC (उदा. HDFC0001234)"
              value={ifscCode}
              onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
            />
            <input
              required
              minLength={5}
              className={field}
              type="text"
              placeholder="UPI ID (उदा. नाव@okaxis)"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
            />
          </div>
          <h3 className="mb-2 text-sm font-medium text-zinc-400">Password</h3>
          <input
            required
            minLength={6}
            type="password"
            placeholder="Min 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
          />
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-medium text-zinc-400">Referral code (optional)</h3>
            <input
              className={`${field} uppercase`}
              type="text"
              placeholder="Enter friend's referral code"
              value={referredByCode}
              onChange={(e) => setReferredByCode(e.target.value.toUpperCase())}
            />
            <p className="mt-1 text-xs text-zinc-500">Valid referral code ने signup केल्यावर first successful ride payment वर 50 off मिळेल.</p>
          </div>
          <p className="mb-3 text-xs text-zinc-500">
            वरील बँक तपशील व इतर फील्ड भरून &quot;Create account&quot; दाबा. Verification नंतरच खाते सक्रिय होईल.
          </p>
          <button
            disabled={loading}
            type="submit"
            className="w-full rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {loading ? 'Creating...' : 'Create account'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-emerald-400 hover:text-emerald-300">
            Login here
          </Link>
        </p>
      </div>
    </div>
  )
}

export default UserSignup
