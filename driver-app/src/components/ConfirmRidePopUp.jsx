import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, withCaptainAuth } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'
import { getCaptainToken } from '../utils/authTokens'
import { getPlaceholderAvatarUrl } from '../config/externalEndpoints'

const ConfirmRidePopUp = (props) => {
    const [ otp, setOtp ] = useState('')
    const [arrived, setArrived] = useState(() => props.ride?.status === 'arrived')
    const [markingArrived, setMarkingArrived] = useState(false)
    const navigate = useNavigate()

    const rideId = props.ride?._id
    const canStart = useMemo(() => arrived && otp.trim().length === 6, [arrived, otp])

    useEffect(() => {
        setArrived(props.ride?.status === 'arrived')
    }, [ props.ride?._id, props.ride?.status ])

    const markArrived = async () => {
        if (!rideId) return
        setMarkingArrived(true)
        try {
            await apiClient.post('/rides/arrive', { rideId }, withCaptainAuth())
            setArrived(true)
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to mark arrived')
        } finally {
            setMarkingArrived(false)
        }
    }

    const submitHander = async (e) => {
        e.preventDefault()
        const token = getCaptainToken()
        if (!token) {
            alert('Please log in again.')
            return
        }
        const rid = props.ride?._id != null ? String(props.ride._id) : ''
        const code = String(otp || '').trim()
        if (!rid || code.length !== 6) {
            alert('Enter the 6-digit OTP from the passenger.')
            return
        }
        const startOnce = () => apiClient.get('/rides/start-ride', {
            ...withCaptainAuth(),
            params: { rideId: rid, otp: code },
        })

        const onOk = (response) => {
            if (response.status === 200) {
                props.setConfirmRidePopupPanel(false)
                props.setRidePopupPanel(false)
                const raw = stripApiEnvelope(response.data)
                const rideState = { ...raw }
                delete rideState.confirmation
                try {
                    sessionStorage.setItem('rideeasy_last_start_otp', code)
                } catch { /* ignore */ }
                navigate('/captain-riding', { state: { ride: rideState, startOtp: code } })
            }
        }

        try {
            const response = await startOnce()
            onOk(response)
        } catch (err) {
            const status = err.response?.status
            const msg = String(err.response?.data?.message || '')
            if (status === 409 && /arriv/i.test(msg)) {
                try {
                    await apiClient.post('/rides/arrive', { rideId: rid }, withCaptainAuth())
                    setArrived(true)
                    const response = await startOnce()
                    onOk(response)
                    return
                } catch (err2) {
                    const msg2 =
                        err2.response?.data?.message
                        || err2.response?.data?.errors?.[0]?.msg
                        || err2.message
                        || 'Could not mark arrived or start ride'
                    alert(msg2)
                    return
                }
            }
            const finalMsg =
                err.response?.data?.message
                || err.response?.data?.errors?.[0]?.msg
                || err.message
                || 'Could not start ride'
            alert(finalMsg)
        }
    }
    return (
        <div>
            <h5 className='p-1 text-center w-[93%] absolute top-0' onClick={() => {
                props.setRidePopupPanel(false)
            }}><i className="text-3xl text-gray-200 ri-arrow-down-wide-line"></i></h5>
            <h3 className='text-2xl font-semibold mb-5'>Confirm this ride to Start</h3>
            <div className='flex items-center justify-between p-3 border-2 border-yellow-400 rounded-lg mt-4'>
                <div className='flex items-center gap-3 '>
                    <img className='h-12 rounded-full object-cover w-12' src={getPlaceholderAvatarUrl()} alt="" />
                    <h2 className='text-lg font-medium capitalize'>{props.ride?.user?.name || props.ride?.user?.fullname?.firstname}</h2>
                </div>
                <h5 className='text-lg font-semibold'>{props.ride?.distance ?? '—'} km</h5>
            </div>
            <div className='flex gap-2 justify-between flex-col items-center'>
                <div className='w-full mt-5'>
                    <div className='flex items-center gap-5 p-3 border-b-2'>
                        <i className="ri-map-pin-user-fill"></i>
                        <div>
                            <p className='text-sm -mt-1 text-gray-600'>{props.ride?.pickupLocation || props.ride?.pickup}</p>
                        </div>
                    </div>
                    <div className='flex items-center gap-5 p-3 border-b-2'>
                        <i className="text-lg ri-map-pin-2-fill"></i>
                        <div>
                            <p className='text-sm -mt-1 text-gray-600'>{props.ride?.dropLocation || props.ride?.destination}</p>
                        </div>
                    </div>
                    <div className='flex items-center gap-5 p-3'>
                        <i className="ri-currency-line"></i>
                        <div>
                            <h3 className='text-lg font-medium'>₹{props.ride?.price ?? props.ride?.fare} </h3>
                            <p className='text-sm -mt-1 text-gray-600'>Cash Cash</p>
                        </div>
                    </div>
                </div>

                <div className='mt-6 w-full'>
                    {!arrived && (
                        <button
                            type="button"
                            onClick={markArrived}
                            disabled={markingArrived}
                            className={`w-full text-lg flex justify-center font-semibold p-3 rounded-lg ${markingArrived ? 'bg-slate-200 text-slate-700' : 'bg-amber-500 text-white'}`}
                        >
                            {markingArrived ? 'Marking arrived…' : 'Mark Arrived at Pickup'}
                        </button>
                    )}
                    <form onSubmit={submitHander}>
                        <input
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            disabled={!arrived}
                            className={`bg-[#eee] px-6 py-4 font-mono text-lg rounded-lg w-full mt-3 ${!arrived ? 'opacity-60' : ''}`}
                            placeholder={arrived ? 'Enter OTP' : 'Arrive first to enter OTP'}
                        />

                        <button disabled={!canStart} className={`w-full mt-5 text-lg flex justify-center font-semibold p-3 rounded-lg ${canStart ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-700'}`}>Start Ride</button>
                        <button onClick={() => {
                            props.setConfirmRidePopupPanel(false)
                            props.setRidePopupPanel(false)

                        }} className='w-full mt-2 bg-red-600 text-lg text-white font-semibold p-3 rounded-lg'>Cancel</button>

                    </form>
                </div>
            </div>
        </div>
    )
}

export default ConfirmRidePopUp