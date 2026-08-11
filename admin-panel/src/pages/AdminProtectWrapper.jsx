import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAdminToken } from '../utils/authTokens'
import { isAdminRoleToken } from '../utils/jwtPayload'

/**
 * Gate admin routes: require stored JWT with role admin.
 * No extra API ping here — avoids duplicate /admin/analytics with the dashboard and reduces 429 risk.
 */
const AdminProtectWrapper = ({ children }) => {
  const navigate = useNavigate()
  const token = getAdminToken()

  useEffect(() => {
    if (!token) {
      navigate('/admin', { replace: true })
      return
    }
    if (!isAdminRoleToken(token)) {
      try {
        localStorage.removeItem('adminToken')
      } catch { /* ignore */ }
      navigate('/admin', { replace: true })
    }
  }, [token, navigate])

  if (!token || !isAdminRoleToken(token)) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center p-8 text-neutral-600 text-sm bg-white">
        Redirecting…
      </div>
    )
  }

  return <>{children}</>
}

export default AdminProtectWrapper
