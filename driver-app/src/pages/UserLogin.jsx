import React, { useState, useContext } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { UserDataContext } from '../context/UserContext'
import { apiClient } from '../services/http'
import { formatApiError } from '../utils/apiError'

const UserLogin = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const { setUser } = useContext(UserDataContext)
  const navigate = useNavigate()
  const location = useLocation()
  const submitHandler = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)
      setFormError('')
      const response = await apiClient.post('/users/login', {
        email: String(email || '').trim().toLowerCase(),
        password
      })
      if (response.status === 200) {
        const data = response.data
        const user = data?.user ?? data
        const token = data?.token
        if (user && token) {
          setUser(user)
          localStorage.setItem('token', token)
          navigate('/home', { state: location?.state })
        }
      }
      setEmail('')
      setPassword('')
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
          <h3 className="text-lg font-medium mb-2">Email</h3>
          <input
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-[#eeeeee] mb-4 rounded-lg px-4 py-2 border w-full text-lg text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            type="email"
            placeholder="email@example.com"
          />
          <h3 className="text-lg font-medium mb-2">Password</h3>
          <input
            required
            className="bg-[#eeeeee] mb-6 rounded-lg px-4 py-2 border w-full text-lg text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
          />
          <button
            disabled={loading}
            className="bg-[#111] text-white font-semibold rounded-lg px-4 py-2 w-full text-lg"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        <p className="text-center mt-4">New here? <Link to="/signup" className="text-emerald-600">Create account</Link></p>
      </div>
    </div>
  )
}

export default UserLogin
