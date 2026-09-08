import React, { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiClient } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { isAdminRoleToken } from '../utils/jwtPayload'
import { useLanguage, LANGUAGE_OPTIONS } from '../i18n'

const AdminLogin = () => {
  const { t, language, setLanguage } = useLanguage()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [langOpen, setLangOpen] = useState(false)
  const langRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const click = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false)
    }
    window.addEventListener('mousedown', click)
    return () => window.removeEventListener('mousedown', click)
  }, [])

  const submitHandler = async (e) => {
    e.preventDefault()
    setError('')
    try {
      setLoading(true)
      const payload = {
        email: String(email || '').trim().toLowerCase(),
        password: String(password || '').trim(),
      }
      const { data } = await apiClient.post('/admin/login', payload)
      const token = data?.token
      if (!token) {
        setError(t('invalid_server_response'))
        return
      }
      if (!isAdminRoleToken(token)) {
        setError(t('access_denied_admin_role'))
        return
      }
      localStorage.setItem('adminToken', token)
      navigate('/admin/dashboard')
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4 sm:p-6 text-black font-sans">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-10 shadow-xl w-full max-w-md relative">
        <div className="absolute top-4 right-4" ref={langRef}>
          <button
            onClick={() => setLangOpen(!langOpen)}
            className="flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-bold text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            <i className="ri-translate-2" />
            {LANGUAGE_OPTIONS.find(o => o.code === language)?.label}
          </button>
          {langOpen && (
            <div className="absolute right-0 mt-1 w-28 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg z-10">
              {LANGUAGE_OPTIONS.map(opt => (
                <button
                  key={opt.code}
                  onClick={() => { setLanguage(opt.code); setLangOpen(false) }}
                  className={`w-full px-3 py-2 text-left text-xs hover:bg-neutral-50 ${opt.code === language ? 'text-emerald-600 font-bold bg-emerald-50' : 'text-neutral-700'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Link to="/" className="text-emerald-600 font-black text-2xl tracking-tighter">RideEasy</Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-6 mb-1">{t('admin_login')}</h1>
        <p className="text-slate-500 text-sm mb-8 leading-relaxed">{t('use_admin_credentials')}</p>
        <form onSubmit={submitHandler} className="space-y-4" autoComplete="off">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('email')}</label>
            <input
              type="email"
              name="rideeasy-admin-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 placeholder:text-slate-400"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('password')}</label>
            <input
              type="password"
              name="rideeasy-admin-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 placeholder:text-slate-500"
              required
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3 rounded-xl transition shadow-lg shadow-slate-200 disabled:opacity-50 mt-2"
          >
            {loading ? t('logging_in') : t('login')}
          </button>
        </form>
        <Link to="/" className="block text-center text-slate-400 font-medium text-xs mt-6 hover:text-slate-600 transition-colors">{t('back_to_home')}</Link>
      </div>
    </div>
  )
}

export default AdminLogin
