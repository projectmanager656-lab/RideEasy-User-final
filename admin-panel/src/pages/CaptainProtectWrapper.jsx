import React, { useContext, useEffect, useState } from 'react'
import { CaptainDataContext } from '../context/CaptainContext'
import { useNavigate } from 'react-router-dom'
import { apiClient, withCaptainAuth } from '../services/http'

const CaptainProtectWrapper = ({
    children
}) => {

    const token = localStorage.getItem('captainToken') || localStorage.getItem('captain-token')
    const navigate = useNavigate()
    const { setCaptain } = useContext(CaptainDataContext)
    const [ isLoading, setIsLoading ] = useState(true)

    useEffect(() => {
        if (!token) {
            setIsLoading(false)
            navigate('/captain-login', { replace: true })
            return
        }

        let cancelled = false
        setIsLoading(true)
        apiClient.get('/captains/profile', withCaptainAuth())
            .then((response) => {
                if (cancelled || response.status !== 200) return
                const cap = response.data?.captain ?? response.data
                if (cap) setCaptain(cap)
            })
            .catch(() => {
                if (cancelled) return
                localStorage.removeItem('captainToken')
                localStorage.removeItem('captain-token')
                navigate('/captain-login', { replace: true })
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [ token, navigate, setCaptain ])

    

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

export default CaptainProtectWrapper