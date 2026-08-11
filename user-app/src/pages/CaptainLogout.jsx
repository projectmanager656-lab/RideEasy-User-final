import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../services/http'
import { getCaptainToken } from '../utils/authTokens'

export const CaptainLogout = () => {
    const token = getCaptainToken()
    const navigate = useNavigate()

    useEffect(() => {
        if (!token) {
            navigate('/captain-login', { replace: true })
            return
        }
        let cancelled = false
        apiClient.get('/captains/logout', {
            headers: { Authorization: token ? `Bearer ${token}` : undefined },
        })
            .catch(() => { /* still clear local session */ })
            .finally(() => {
                if (cancelled) return
                localStorage.removeItem('captainToken')
                localStorage.removeItem('captain-token')
                navigate('/captain-login', { replace: true })
            })
        return () => {
            cancelled = true
        }
    }, [ token, navigate ])

    return (
        <div className="p-6 text-slate-600">Signing out…</div>
    )
}

export default CaptainLogout
