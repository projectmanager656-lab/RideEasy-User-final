import React, { useState, useContext, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { UserDataContext } from '../context/UserContext'
import { apiClient } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { stripApiEnvelope } from '../utils/apiBody'

const inputClass =
  'mb-4 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-base text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'

const UserLogin = () => {
  const [ email, setEmail ] = useState('')
  const [ password, setPassword ] = useState('')
  const [ loading, setLoading ] = useState(false)
  const [ formError, setFormError ] = useState('')
  const { setSession, authLoading, token } = useContext(UserDataContext)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (authLoading) return
    if (token) {
      navigate('/location', { replace: true })
    }
  }, [ authLoading, token, navigate ])

  const submitHandler = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)
      setFormError('')
      const response = await apiClient.post('/users/login', {
        email: String(email || '').trim().toLowerCase(),
        password,
      })
      if (response.status === 200) {
        const data = stripApiEnvelope(response.data)
        const user = data?.user ?? data
        const token = data?.token
        if (user && token) {
          setSession(token, user)
          navigate('/location', { replace: true, state: location?.state })
          setEmail('')
          setPassword('')
        } else {
          setFormError('Login response missing user or token.')
        }
      }
    } catch (error) {
      setFormError(formatApiError(error))
    } finally {
      setLoading(false)
    }
  }

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
    <div className="min-h-screen bg-black text-white flex flex-col p-6 sm:p-8">
      <div className="mx-auto w-full max-w-md">
        <Link to="/login" className="mb-8 inline-block">
          <span className="text-2xl font-bold text-emerald-400">RideEasy</span>
        </Link>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/90 p-6 shadow-xl">
          <h2 className="mb-6 text-xl font-semibold">Sign in</h2>
          <form onSubmit={submitHandler}>
            {formError ? (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200 whitespace-pre-line"
              >
                {formError}
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
              required
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
        <p className="mt-6 text-center text-sm text-zinc-500">
          New here?{' '}
          <Link to="/signup" className="font-medium text-emerald-400 hover:text-emerald-300">
            Create account
          </Link>
        </p>
      </div>
    </div>
  )
}

export default UserLogin
