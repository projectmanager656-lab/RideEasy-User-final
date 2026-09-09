import React, { useContext, useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CaptainDataContext } from '../context/CaptainContext'
import { apiClient } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'
import { formatApiError } from '../utils/apiError'
import { getCaptainToken } from '../utils/authTokens'
import { useLanguage, LANGUAGE_OPTIONS } from '../i18n'

const inputClass =
  'mb-4 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 w-full text-base text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'

const Captainlogin = () => {
  const { t, language, setLanguage } = useLanguage()
  const [ email, setEmail ] = useState('')
  const [ password, setPassword ] = useState('')
  const [ phone, setPhone ] = useState('')
  const [ otp, setOtp ] = useState('')
  const [ otpSent, setOtpSent ] = useState(false)
  const [ otpLoading, setOtpLoading ] = useState(false)
  const [ loading, setLoading ] = useState(false)
  const [ error, setError ] = useState('')
  const [ langOpen, setLangOpen ] = useState(false)
  const langRef = useRef(null)

  const { setCaptain } = useContext(CaptainDataContext)
  const navigate = useNavigate()

  useEffect(() => {
    const click = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false)
    }
    window.addEventListener('mousedown', click)
    return () => window.removeEventListener('mousedown', click)
  }, [])

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
          setError(t('login_response_missing'))
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
          setError(t('verification_response_missing'))
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
        <div className="relative mb-8 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-xl">
          <div className="absolute top-6 right-6" ref={langRef}>
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-bold text-zinc-400 hover:bg-zinc-800 transition-colors"
            >
              <i className="ri-translate-2" />
              {LANGUAGE_OPTIONS.find(o => o.code === language)?.label}
            </button>
            {langOpen && (
              <div className="absolute right-0 mt-1 w-28 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl z-10">
                {LANGUAGE_OPTIONS.map(opt => (
                  <button
                    key={opt.code}
                    onClick={() => { setLanguage(opt.code); setLangOpen(false) }}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-zinc-800 ${opt.code === language ? 'text-emerald-400 font-bold bg-emerald-500/5' : 'text-zinc-300'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mb-6 flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10">
              <span className="text-xl font-bold text-emerald-400">R</span>
            </span>
            <div>
              <p className="text-lg font-semibold">{t('rideeasy_driver')}</p>
              <p className="text-xs text-zinc-500">{t('sign_in_to_go_online')}</p>
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
            <label className="mb-1 block text-sm text-zinc-400">{t('email')}</label>
            <input
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              type="email"
              placeholder="email@example.com"
            />
            <label className="mb-1 block text-sm text-zinc-400">{t('password')}</label>
            <input
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
              placeholder={t('password')}
            />
            <button
              disabled={loading}
              type="submit"
              className="w-full rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {loading ? t('logging_in') : t('login')}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
          <h4 className="mb-3 text-sm font-semibold text-zinc-300">{t('phone_otp')}</h4>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            type="tel"
            placeholder={t('driver_phone_number')}
          />
          {!otpSent ? (
            <button
              type="button"
              onClick={sendOtp}
              disabled={otpLoading || !String(phone || '').trim()}
              className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {otpLoading ? t('sending_otp') : t('send_otp')}
            </button>
          ) : (
            <div className="space-y-2">
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className={inputClass}
                type="text"
                maxLength={6}
                placeholder={t('otp_6_digit')}
              />
              <button
                type="button"
                onClick={verifyOtp}
                disabled={otpLoading || String(otp || '').trim().length !== 6}
                className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {otpLoading ? t('verifying') : t('verify_login')}
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-zinc-500">
          {t('new_here')}{' '}
          <Link to="/captain-signup" className="font-medium text-emerald-400 hover:text-emerald-300">
            {t('register')}
          </Link>
        </p>
      </div>
    </div>
  )
}

export default Captainlogin
