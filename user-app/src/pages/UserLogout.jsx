import React, { useContext, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { logout } from '../services/authService'
import { UserDataContext } from '../context/UserContext'

export const UserLogout = () => {
    const token = localStorage.getItem('token')
    const navigate = useNavigate()
    const { clearSession } = useContext(UserDataContext)

    useEffect(() => {
        if (!token) {
            clearSession()
            navigate('/welcome', { replace: true })
            return
        }
        let cancelled = false
        logout()
            .catch(() => { /* still clear local session */ })
            .finally(() => {
                if (cancelled) return
                clearSession()
                navigate('/welcome', { replace: true })
            })
        return () => {
            cancelled = true
        }
    }, [ token, navigate, clearSession ])

    return (
        <div className="flex min-h-[30vh] items-center justify-center bg-black px-6 text-sm text-zinc-400">
            Signing out…
        </div>
    )
}

export default UserLogout
