import React, { useContext, useEffect, useState } from 'react'
import { UserDataContext } from '../context/UserContext'
import { useNavigate } from 'react-router-dom'
import { apiClient, withAuth } from '../services/http'

const UserProtectWrapper = ({
    children
}) => {
    const token = localStorage.getItem('token')
    const navigate = useNavigate()
    const { setUser } = useContext(UserDataContext)
    const [ isLoading, setIsLoading ] = useState(true)

    useEffect(() => {
        if (!token) {
            setIsLoading(false)
            navigate('/login', { replace: true })
            return
        }

        let cancelled = false
        setIsLoading(true)
        apiClient.get('/users/profile', withAuth())
            .then((response) => {
                if (cancelled || response.status !== 200) return
                const u = response.data?.user ?? response.data
                if (u && typeof u === 'object') setUser(u)
            })
            .catch(() => {
                if (cancelled) return
                localStorage.removeItem('token')
                navigate('/login', { replace: true })
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [ token, navigate, setUser ])

    if (isLoading) {
        return (
            <div>Loading...</div>
        )
    }

    return (
        <>
            {children}
        </>
    )
}

export default UserProtectWrapper