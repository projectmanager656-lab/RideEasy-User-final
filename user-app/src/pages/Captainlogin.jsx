import React, { useContext, useState } from 'react'
import { Link } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { CaptainDataContext } from '../context/CaptainContext'
import { captainLogin, captainSendPhoneOtp, captainVerifyPhoneOtp } from '../services/captainService'

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



  const submitHandler = async (e) => {
    e.preventDefault();
    setError('')

    try {
      setLoading(true)
      const data = await captainLogin({
        email: String(email || '').trim().toLowerCase(),
        password
      })

      if (data?.token) {
        setCaptain(data.captain)
        localStorage.setItem('captainToken', data.token)
        navigate('/captain-home')

        setEmail('')
        setPassword('')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  const sendOtp = async () => {
    try {
      setError('')
      setOtpLoading(true)
      await captainSendPhoneOtp(String(phone || '').trim())
      setOtpSent(true)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send OTP')
    } finally {
      setOtpLoading(false)
    }
  }

  const verifyOtp = async () => {
    try {
      setError('')
      setOtpLoading(true)
      const data = await captainVerifyPhoneOtp(String(phone || '').trim(), String(otp || '').trim())
      if (data?.token) {
        setCaptain(data.captain)
        localStorage.setItem('captainToken', data.token)
        navigate('/captain-home')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'OTP verification failed')
    } finally {
      setOtpLoading(false)
    }
  }

  return (
    <div className='p-7 h-screen flex flex-col justify-between'>
      <div>
        <div className='mb-6'>
          <span className='inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/40'>
            <span className='text-xl font-bold text-emerald-500'>R</span>
          </span>
          <p className='mt-2 text-lg font-semibold'>RideEasy Driver</p>
        </div>

        <form onSubmit={(e) => {
          submitHandler(e)
        }}>
          <h3 className='text-lg font-medium mb-2'>What&apos;s your email</h3>
          <input
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
            }}
            className='bg-[#eeeeee] mb-7 rounded-lg px-4 py-2 border w-full text-lg text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
            type="email"
            placeholder='email@example.com'
          />

          <h3 className='text-lg font-medium mb-2'>Enter Password</h3>

          <input
            className='bg-[#eeeeee] mb-7 rounded-lg px-4 py-2 border w-full text-lg text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
            }}
            required type="password"
            placeholder='password'
          />

          <button
            disabled={loading}
            className='bg-[#111] text-white font-semibold mb-3 rounded-lg px-4 py-2 w-full text-lg placeholder:text-base disabled:opacity-60'
          >{loading ? 'Logging in…' : 'Login'}</button>

          {error && (
            <p className="text-red-600 text-sm -mt-1 mb-3">{error}</p>
          )}

        </form>

        <div className='mt-5 rounded-lg border border-slate-200 p-4'>
          <h4 className='text-sm font-semibold mb-2'>Login with Phone OTP</h4>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className='bg-[#eeeeee] mb-2 rounded-lg px-4 py-2 border w-full text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
            type='tel'
            placeholder='Driver phone number'
          />
          {!otpSent ? (
            <button
              type='button'
              onClick={sendOtp}
              disabled={otpLoading || !String(phone || '').trim()}
              className='bg-emerald-600 text-white font-semibold rounded-lg px-4 py-2 w-full text-sm disabled:opacity-60'
            >
              {otpLoading ? 'Sending OTP…' : 'Send OTP'}
            </button>
          ) : (
            <div className='space-y-2'>
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className='bg-[#eeeeee] rounded-lg px-4 py-2 border w-full text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
                type='text'
                maxLength={6}
                placeholder='Enter 6-digit OTP'
              />
              <button
                type='button'
                onClick={verifyOtp}
                disabled={otpLoading || String(otp || '').trim().length !== 6}
                className='bg-emerald-600 text-white font-semibold rounded-lg px-4 py-2 w-full text-sm disabled:opacity-60'
              >
                {otpLoading ? 'Verifying…' : 'Verify OTP & Login'}
              </button>
            </div>
          )}
        </div>
        <p className='text-center'>Join a fleet? <Link to='/captain-signup' className='text-blue-600'>Register as a Captain</Link></p>
      </div>
      <div>
        <Link
          to='/login'
          className='bg-[#d5622d] flex items-center justify-center text-white font-semibold mb-5 rounded-lg px-4 py-2 w-full text-lg placeholder:text-base'
        >Sign in as User</Link>
      </div>
    </div>
  )
}

export default Captainlogin