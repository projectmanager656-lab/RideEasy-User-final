import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiClient } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { isAdminRoleToken } from '../utils/jwtPayload'

const AdminLogin = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

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
        setError('Invalid response from server')
        return
      }
      if (!isAdminRoleToken(token)) {
        setError('Access denied — admin role required')
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
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4 text-slate-900">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md text-slate-900">
        <Link to="/" className="text-emerald-600 font-bold text-xl">RideEasy</Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-4 mb-2">Admin Login</h1>
        <p className="text-slate-600 text-sm mb-6">Use your admin credentials</p>
        <form onSubmit={submitHandler} className="space-y-4" autoComplete="off">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
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
            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        <Link to="/" className="block text-center text-slate-500 text-sm mt-4">Back to home</Link>
      </div>
    </div>
  )
}

export default AdminLogin
