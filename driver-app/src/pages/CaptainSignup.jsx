import React, { useState, useContext, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CaptainDataContext } from '../context/CaptainContext'
import { apiClient } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'
import { formatApiError } from '../utils/apiError'
import { getCaptainToken } from '../utils/authTokens'
import { getApiBaseUrl } from '../config/apiBaseUrl'

const inp = 'rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 w-full text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500'

const FALLBACK_PLANS = {
  BIKE: { weekly: 29, monthly: 99, yearly: 899 },
  AUTO: { weekly: 39, monthly: 149, yearly: 1199 },
  CAR: { weekly: 59, monthly: 199, yearly: 1599 },
}

const CaptainSignup = () => {
  const navigate = useNavigate()
  const { setCaptain } = useContext(CaptainDataContext)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [vehicleType, setVehicleType] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [license, setLicense] = useState('')
  const [city, setCity] = useState('Kolhapur')
  const [subscriptionPlan, setSubscriptionPlan] = useState('monthly')
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [planTiers, setPlanTiers] = useState(null)
  const [upiId, setUpiId] = useState('')
  const [accountHolderName, setAccountHolderName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [ifscCode, setIfscCode] = useState('')
  const [bankUpiId, setBankUpiId] = useState('')
  const selectedVehicle = vehicleType || 'AUTO'
  const currentPlanPrices = planTiers?.[selectedVehicle] || FALLBACK_PLANS[selectedVehicle] || FALLBACK_PLANS.AUTO

  useEffect(() => {
    if (getCaptainToken()) {
      navigate('/captain-home', { replace: true })
    }
  }, [ navigate ])

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/driver-subscriptions/plans`)
      .then((r) => r.json())
      .then((d) => setPlanTiers(d?.plans || null))
      .catch(() => setPlanTiers(null))
  }, [])

  const submitHandler = async (e) => {
    e.preventDefault()
    const bFields = [ accountHolderName.trim(), accountNumber.trim(), ifscCode.trim(), bankUpiId.trim() || upiId.trim() ]
    const bFilled = bFields.filter(Boolean).length
    if (bFilled > 0 && bFilled < 4) {
      setFormError('Bank details: enter holder name, account number, IFSC, and UPI together, or leave all blank.')
      return
    }
    try {
      setLoading(true)
      setFormError('')
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        email: String(email || '').trim().toLowerCase(),
        password,
        vehicleType: vehicleType || 'AUTO',
        vehicleNumber: vehicleNumber.trim(),
        license: license.trim(),
        city: city || 'Kolhapur',
        subscriptionPlan,
        ...(upiId.trim() ? { upiId: upiId.trim().toLowerCase() } : {}),
      }
      if (bFilled === 4) {
        payload.bankDetails = {
          accountHolderName: accountHolderName.trim(),
          accountNumber: accountNumber.trim().replace(/\s+/g, ''),
          ifscCode: ifscCode.trim().toUpperCase(),
          upiId: (bankUpiId.trim() || upiId.trim()).toLowerCase(),
        }
      }
      const response = await apiClient.post('/captains/register', payload)
      if (response.status === 201 || response.status === 200) {
        const data = stripApiEnvelope(response.data)
        const cap = data?.captain ?? data
        const token = data?.token
        if (cap && token) {
          setCaptain(cap)
          localStorage.setItem('captainToken', token)
          navigate('/captain-home', { replace: true })
        } else {
          setFormError('Registration response missing account or token.')
        }
      }
    } catch (err) {
      setFormError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white px-5 py-6 pb-24">
      <div className="mx-auto max-w-md">
        <Link to="/captain-login" className="text-emerald-400 font-bold text-xl">RideEasy</Link>
        <h2 className="text-lg font-semibold mt-4 mb-2 text-zinc-200">Driver Registration</h2>
        <form onSubmit={submitHandler} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
          {formError ? (
            <div role="alert" className="rounded-xl border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200 whitespace-pre-line">
              {formError}
            </div>
          ) : null}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Name</label>
            <input required minLength={2} className={inp} type="text" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Phone</label>
            <input required className={inp} type="tel" placeholder="10-digit mobile" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Email</label>
            <input required type="email" className={inp} placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Vehicle type</label>
            <select required className={inp} value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
              <option value="">Select</option>
              <option value="BIKE">Bike</option>
              <option value="AUTO">Auto</option>
              <option value="CAR">Cab</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Vehicle number</label>
            <input required minLength={3} className={inp} type="text" placeholder="e.g. MH12AB1234" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">License number</label>
            <input required minLength={5} className={inp} type="text" placeholder="License no." value={license} onChange={(e) => setLicense(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Operating city</label>
            <select className={inp} value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="Kolhapur">Kolhapur</option>
              <option value="Ichalkaranji">Ichalkaranji</option>
              <option value="Sangli">Sangli</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Choose subscription plan</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'weekly', label: 'Weekly', amount: currentPlanPrices.weekly },
                { id: 'monthly', label: 'Monthly', amount: currentPlanPrices.monthly, recommended: true },
                { id: 'yearly', label: 'Yearly', amount: currentPlanPrices.yearly },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSubscriptionPlan(p.id)}
                  className={`rounded-xl border px-2 py-2 text-xs font-medium ${subscriptionPlan === p.id ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' : 'border-zinc-700 bg-zinc-900 text-zinc-300'}`}
                >
                  {p.label}
                  {p.recommended ? <div className="text-[10px] font-semibold text-emerald-400">Recommended</div> : null}
                  <div className="mt-1 text-[11px]">₹{p.amount}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Your UPI ID for passenger payments (optional)</label>
            <input className={inp} type="text" placeholder="you@paytm" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
          </div>
          <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-3 space-y-2">
            <p className="text-xs font-medium text-zinc-400">Bank details for payouts (optional)</p>
            <p className="text-[11px] text-zinc-500">If you add this, fill all four fields. UPI can match the field above.</p>
            <input className={inp} type="text" placeholder="Account holder name" value={accountHolderName} onChange={(e) => setAccountHolderName(e.target.value)} />
            <input className={inp} type="text" inputMode="numeric" placeholder="Account number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))} />
            <input className={inp} type="text" placeholder="IFSC (e.g. HDFC0001234)" value={ifscCode} onChange={(e) => setIfscCode(e.target.value.toUpperCase())} />
            <input className={inp} type="text" placeholder="UPI for bank record (or leave blank if same as above)" value={bankUpiId} onChange={(e) => setBankUpiId(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Password</label>
            <input required minLength={6} className={inp} type="password" placeholder="Min 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button disabled={loading} type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl px-4 py-3 w-full disabled:opacity-60">
            {loading ? 'Creating...' : 'Create Driver Account'}
          </button>
        </form>
        <p className="text-center mt-4 text-zinc-500 text-sm">Already have an account? <Link to="/captain-login" className="text-emerald-400">Login here</Link></p>
      </div>
    </div>
  )
}

export default CaptainSignup
