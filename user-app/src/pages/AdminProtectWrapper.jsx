import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAdminToken } from '../utils/authTokens'
import { isAdminRoleToken } from '../utils/jwtPayload'
import { getAdminAnalytics } from '../services/adminService'

const AdminProtectWrapper = ({ children }) => {
  const token = getAdminToken()
  const navigate = useNavigate()
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    if (!token) {
      navigate('/admin')
      return
    }
    if (!isAdminRoleToken(token)) {
      localStorage.removeItem('adminToken')
      navigate('/admin')
      return
    }
    getAdminAnalytics()
      .then(() => setAllowed(true))
      .catch((err) => {
        // Only invalid/expired token should log out; network / 500 still show dashboard with error.
        if (err.response?.status === 401) {
          localStorage.removeItem('adminToken')
          navigate('/admin')
          return
        }
        setAllowed(true)
      })
  }, [token, navigate])

  if (!token) return null
  if (!allowed) return <div className="p-8 text-slate-700">Loading admin…</div>
  return <>{children}</>
}

export default AdminProtectWrapper
