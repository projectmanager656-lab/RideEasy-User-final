import React, { useContext, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, withAuth } from '../services/http'
import { UserDataContext } from '../context/UserContext'

export const UserLogout = () => {
    const token = localStorage.getItem('token')
    const navigate = useNavigate()
    const { setUser } = useContext(UserDataContext)

    useEffect(() => {
        if (!token) {
            setUser({ _id: null, name: '', phone: '', email: '' })
            navigate('/login', { replace: true })
            return
        }
        let cancelled = false
        apiClient.get('/users/logout', withAuth())
            .catch(() => { /* still clear local session */ })
            .finally(() => {
                if (cancelled) return
                localStorage.removeItem('token')
                setUser({ _id: null, name: '', phone: '', email: '' })
                navigate('/login', { replace: true })
            })
        return () => {
            cancelled = true
        }
    }, [ token, navigate, setUser ])

    return (
        <div className="p-6 text-slate-600">Signing out…</div>
    )
}

export default UserLogout
