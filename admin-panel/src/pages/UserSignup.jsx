import React, { useState, useContext } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { UserDataContext } from '../context/UserContext'
import { apiClient } from '../services/http'
import { formatApiError } from '../utils/apiError'
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
  const { setUser } = useContext(UserDataContext)
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
        const data = response.data
        const user = data?.user ?? data
        const token = data?.token
        if (user && token) {
          setUser(user)
          localStorage.setItem('token', token)
          navigate('/home', { state: location?.state })
          setName('')
          setPhone('')
          setEmail('')
          setPassword('')
          setAccountHolderName('')
          setAccountNumber('')
          setIfscCode('')
          setUpiId('')
          setReferredByCode('')
        }
      }
    } catch (error) {
      setFormError(formatApiError(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-7 min-h-screen flex flex-col justify-between">
      <div>
        <Link to="/" className="inline-block mb-6">
          <span className="text-2xl font-bold text-emerald-600">RideEasy</span>
        </Link>
        <form onSubmit={submitHandler}>
          {formError ? (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 whitespace-pre-line"
            >
              {formError}
            </div>
          ) : null}
          <h3 className="text-lg font-medium mb-2">Your name</h3>
          <input
            required
            minLength={2}
            className="bg-[#eeeeee] mb-4 rounded-lg px-4 py-2 border w-full text-lg text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <h3 className="text-lg font-medium mb-2">Phone</h3>
          <input
            required
            className="bg-[#eeeeee] mb-4 rounded-lg px-4 py-2 border w-full text-lg text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            type="tel"
            placeholder="10-digit mobile"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <h3 className="text-lg font-medium mb-2">City</h3>
          <select value={city} onChange={(e) => setCity(e.target.value)} className="bg-[#eeeeee] mb-4 rounded-lg px-4 py-2 border w-full text-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500">
            <option value="Kolhapur">Kolhapur</option>
            <option value="Ichalkaranji">Ichalkaranji</option>
            <option value="Sangli">Sangli</option>
          </select>
          <h3 className="text-lg font-medium mb-2">Email</h3>
          <input
            required
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-[#eeeeee] mb-4 rounded-lg px-4 py-2 border w-full text-lg text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
          <div className="rounded-xl border-2 border-emerald-200 p-4 mb-6 bg-emerald-50/50">
            <h3 className="text-lg font-semibold mb-1 text-emerald-900">बँक तपशील (साइनअपसाठी आवश्यक)</h3>
            <p className="text-xs text-slate-600 mb-2 leading-relaxed">
              खाली चारही फील्ड भरा. Bank details (required) — account holder, account number, IFSC, UPI.
            </p>
            <input
              required
              minLength={2}
              className="bg-white mb-3 rounded-lg px-4 py-2 border w-full text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              type="text"
              placeholder="खातेदाराचे नाव / Account holder name"
              value={accountHolderName}
              onChange={(e) => setAccountHolderName(e.target.value)}
            />
            <input
              required
              minLength={9}
              maxLength={18}
              className="bg-white mb-3 rounded-lg px-4 py-2 border w-full text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              type="text"
              inputMode="numeric"
              placeholder="खाते क्रमांक / Account number (9–18 digits)"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
            />
            <input
              required
              minLength={11}
              maxLength={11}
              className="bg-white mb-3 rounded-lg px-4 py-2 border w-full text-base uppercase text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              type="text"
              placeholder="IFSC (उदा. HDFC0001234)"
              value={ifscCode}
              onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
            />
            <input
              required
              minLength={5}
              className="bg-white rounded-lg px-4 py-2 border w-full text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              type="text"
              placeholder="UPI ID (उदा. नाव@okaxis)"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
            />
            <p className="text-xs text-slate-600 mt-2">Verification नंतरच खाते पूर्ण होईल.</p>
          </div>
          <h3 className="text-lg font-medium mb-2">Password</h3>
          <input
            required
            minLength={6}
            type="password"
            placeholder="Min 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-[#eeeeee] mb-6 rounded-lg px-4 py-2 border w-full text-lg text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-2">Referral code (optional)</h3>
            <input
              className="bg-[#eeeeee] rounded-lg px-4 py-2 border w-full text-lg uppercase text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              type="text"
              placeholder="Enter friend's referral code"
              value={referredByCode}
              onChange={(e) => setReferredByCode(e.target.value.toUpperCase())}
            />
            <p className="text-xs text-slate-500 mt-1">Valid referral code ने signup केल्यावर first successful ride payment वर 50 off मिळेल.</p>
          </div>
          <button
            disabled={loading}
            className="bg-[#111] text-white font-semibold rounded-lg px-4 py-2 w-full text-lg"
          >
            {loading ? 'Creating...' : 'Create account'}
          </button>
        </form>
        <p className="text-center mt-4">
          Already have an account? <Link to="/login" className="text-emerald-600">Login here</Link>
        </p>
      </div>
    </div>
  )
}

export default UserSignup
