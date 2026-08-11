import React, { useContext, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CaptainDataContext } from '../context/CaptainContext'
import { apiClient } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'
import { formatApiError } from '../utils/apiError'
import { getCaptainToken } from '../utils/authTokens'

const inputClass =
  'mb-4 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 w-full text-base text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'

const Captainlogin = () => {
  const [ email, setEmail ] = useState('')
  const [ password, setPassword ] = useState('')
  const [ phone, setPhone ] = useState('')
  const [ otp, setOtp ] = useState('')
  const [ otpSent, setOtpSent ] = useState(false)
  const [ otpLoading, setOtpLoading ] = useState(false)
  const [ loading, setLoading ] = useState(false)
  const [ error, setError ] = useState('')

  const { setCaptain } = useContext(CaptainDataContext)
  const navigate = useNavigate()

  useEffect(() => {
    if (getCaptainToken()) {
      navigate('/captain-home', { replace: true })
    }
  }, [ navigate ])

  const submitHandler = async (e) => {
    e.preventDefault()
    setError('')
    const captain = {
      email: String(email || '').trim().toLowerCase(),
      password,
    }
    try {
      setLoading(true)
      const response = await apiClient.post('/captains/login', captain)
      if (response.status === 200) {
        const data = stripApiEnvelope(response.data)
        const cap = data?.captain ?? data
        const token = data?.token
        if (cap && token) {
          setCaptain(cap)
          localStorage.setItem('captainToken', token)
          navigate('/captain-home', { replace: true })
          setEmail('')
          setPassword('')
        } else {
          setError('Login response missing account or token.')
        }
      }
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }

  const sendOtp = async () => {
    try {
      setError('')
      setOtpLoading(true)
      await apiClient.post('/captains/phone/send-otp', {
        phone: String(phone || '').trim(),
      })
      setOtpSent(true)
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setOtpLoading(false)
    }
  }

  const verifyOtp = async () => {
    try {
      setError('')
      setOtpLoading(true)
      const response = await apiClient.post('/captains/phone/verify-otp', {
        phone: String(phone || '').trim(),
        otp: String(otp || '').trim(),
      })
      if (response.status === 200) {
        const data = stripApiEnvelope(response.data)
        const cap = data?.captain ?? data
        const token = data?.token
        if (cap && token) {
          setCaptain(cap)
          localStorage.setItem('captainToken', token)
          navigate('/captain-home', { replace: true })
        } else {
          setError('Verification response missing account or token.')
        }
      }
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setOtpLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between p-6 sm:p-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-xl">
          <div className="mb-6 flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10">
              <span className="text-xl font-bold text-emerald-400">R</span>
            </span>
            <div>
              <p className="text-lg font-semibold">RideEasy Driver</p>
              <p className="text-xs text-zinc-500">Sign in to go online</p>
            </div>
          </div>

          <form onSubmit={submitHandler}>
            {error ? (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200 whitespace-pre-line"
              >
                {error}
              </div>
            ) : null}
            <label className="mb-1 block text-sm text-zinc-400">Email</label>
            <input
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              type="email"
              placeholder="email@example.com"
            />
            <label className="mb-1 block text-sm text-zinc-400">Password</label>
            <input
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
              placeholder="Password"
            />
            <button
              disabled={loading}
              type="submit"
              className="w-full rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {loading ? 'Logging in…' : 'Login'}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
          <h4 className="mb-3 text-sm font-semibold text-zinc-300">Phone OTP</h4>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            type="tel"
            placeholder="Driver phone number"
          />
          {!otpSent ? (
            <button
              type="button"
              onClick={sendOtp}
              disabled={otpLoading || !String(phone || '').trim()}
              className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {otpLoading ? 'Sending OTP…' : 'Send OTP'}
            </button>
          ) : (
            <div className="space-y-2">
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className={inputClass}
                type="text"
                maxLength={6}
                placeholder="6-digit OTP"
              />
              <button
                type="button"
                onClick={verifyOtp}
                disabled={otpLoading || String(otp || '').trim().length !== 6}
                className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {otpLoading ? 'Verifying…' : 'Verify & Login'}
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-zinc-500">
          New driver?{' '}
          <Link to="/captain-signup" className="font-medium text-emerald-400 hover:text-emerald-300">
            Register
          </Link>
        </p>
      </div>
    </div>
  )
}

export default Captainlogin
