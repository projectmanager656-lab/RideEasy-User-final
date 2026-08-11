import React, { useState, useContext, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { CaptainDataContext } from '../context/CaptainContext'
import { API_BASE_URL } from '../config/apiBaseUrl'

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
  const [planTiers, setPlanTiers] = useState(null)
  const [upiId, setUpiId] = useState('')
  const selectedVehicle = vehicleType || 'AUTO'
  const currentPlanPrices = planTiers?.[selectedVehicle] || FALLBACK_PLANS[selectedVehicle] || FALLBACK_PLANS.AUTO

  useEffect(() => {
    axios.get(`${API_BASE_URL}/driver-subscriptions/plans`)
      .then((r) => setPlanTiers(r.data?.plans || null))
      .catch(() => setPlanTiers(null))
  }, [])

  const submitHandler = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)
      const response = await axios.post(`${API_BASE_URL}/captains/register`, {
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
      })
      if (response.status === 201) {
        const data = response.data
        setCaptain(data.captain)
        localStorage.setItem('captainToken', data.token)
        navigate('/captain-home')
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="py-5 px-5 min-h-screen flex flex-col justify-between">
      <div>
        <Link to="/" className="text-emerald-600 font-bold text-xl">RideEasy</Link>
        <h2 className="text-lg font-semibold mt-4 mb-2">Driver Registration</h2>
        <form onSubmit={submitHandler} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Name</label>
            <input required minLength={2} className="bg-[#eeeeee] rounded-lg px-4 py-2 border w-full text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" type="text" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Phone</label>
            <input required className="bg-[#eeeeee] rounded-lg px-4 py-2 border w-full text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" type="tel" placeholder="10-digit mobile" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Email</label>
            <input required type="email" className="bg-[#eeeeee] rounded-lg px-4 py-2 border w-full text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Vehicle type</label>
            <select required className="bg-[#eeeeee] rounded-lg px-4 py-2 border w-full text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
              <option value="">Select</option>
              <option value="BIKE">Bike</option>
              <option value="AUTO">Auto</option>
              <option value="CAR">Cab</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Vehicle number</label>
            <input required minLength={3} className="bg-[#eeeeee] rounded-lg px-4 py-2 border w-full text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" type="text" placeholder="e.g. MH12AB1234" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">License number</label>
            <input required minLength={5} className="bg-[#eeeeee] rounded-lg px-4 py-2 border w-full text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" type="text" placeholder="License no." value={license} onChange={(e) => setLicense(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Operating city</label>
            <select className="bg-[#eeeeee] rounded-lg px-4 py-2 border w-full text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="Kolhapur">Kolhapur</option>
              <option value="Ichalkaranji">Ichalkaranji</option>
              <option value="Sangli">Sangli</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Choose subscription plan</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'weekly', label: 'Weekly', amount: currentPlanPrices.weekly },
                { id: 'monthly', label: 'Monthly', amount: currentPlanPrices.monthly },
                { id: 'yearly', label: 'Yearly', amount: currentPlanPrices.yearly },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSubscriptionPlan(p.id)}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium ${subscriptionPlan === p.id ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-700'}`}
                >
                  {p.label}
                  <div className="mt-1 text-[11px]">₹{p.amount}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">UPI ID for payments (optional)</label>
            <input className="bg-[#eeeeee] rounded-lg px-4 py-2 border w-full text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" type="text" placeholder="you@paytm" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Password</label>
            <input required minLength={6} className="bg-[#eeeeee] rounded-lg px-4 py-2 border w-full text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" type="password" placeholder="Min 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button disabled={loading} className="bg-[#111] text-white font-semibold rounded-lg px-4 py-2 w-full">
            {loading ? 'Creating...' : 'Create Driver Account'}
          </button>
        </form>
        <p className="text-center mt-4">Already have an account? <Link to="/captain-login" className="text-emerald-600">Login here</Link></p>
      </div>
    </div>
  )
}

export default CaptainSignup
