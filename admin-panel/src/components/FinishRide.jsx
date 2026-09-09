import React from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../config/apiBaseUrl'
import { getCaptainToken } from '../utils/authTokens'
import { getPlaceholderAvatarUrl } from '../config/externalEndpoints'

function normalizeLocationText(value, fallback = '—') {
    if (typeof value === 'string') return value
    if (value && typeof value === 'object') {
        if (typeof value.name === 'string') return value.name
        if (Array.isArray(value.coordinates)) return `${value.coordinates[1]}, ${value.coordinates[0]}`
    }
    return fallback
}

function normalizePersonName(user) {
    if (!user) return 'Rider'
    if (typeof user === 'string') return user
    if (typeof user.name === 'string') return user.name
    const first = user?.fullname?.firstname
    const last = user?.fullname?.lastname
    const full = [ first, last ].filter(Boolean).join(' ').trim()
    return full || 'Rider'
}

const FinishRide = (props) => {

    const navigate = useNavigate()

    async function endRide() {
        try {
            const response = await axios.post(`${API_BASE_URL}/rides/end-ride`, {
                rideId: props.ride._id
            }, {
                headers: {
                    Authorization: `Bearer ${getCaptainToken()}`
                }
            })

            if (response.status === 200) {
                navigate('/captain-home')
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Could not complete ride. Please start ride first.')
        }

    }

    return (
        <div>
            <h5 className='p-1 text-center w-[93%] absolute top-0' onClick={() => {
                props.setFinishRidePanel(false)
            }}><i className="text-3xl text-gray-200 ri-arrow-down-wide-line"></i></h5>
            <h3 className='text-2xl font-semibold mb-5'>Finish this Ride</h3>
            <div className='flex items-center justify-between p-4 border-2 border-yellow-400 rounded-lg mt-4'>
                <div className='flex items-center gap-3 '>
                    <img className='h-12 rounded-full object-cover w-12' src={getPlaceholderAvatarUrl()} alt="" />
                    <h2 className='text-lg font-medium'>{normalizePersonName(props.ride?.user)}</h2>
                </div>
                <h5 className='text-lg font-semibold'>2.2 KM</h5>
            </div>
            <div className='flex gap-2 justify-between flex-col items-center'>
                <div className='w-full mt-5'>
                    <div className='flex items-center gap-5 p-3 border-b-2'>
                        <i className="ri-map-pin-user-fill"></i>
                        <div>
                            <h3 className='text-lg font-medium'>562/11-A</h3>
                            <p className='text-sm -mt-1 text-gray-600'>{normalizeLocationText(props.ride?.pickupLocation || props.ride?.pickup)}</p>
                        </div>
                    </div>
                    <div className='flex items-center gap-5 p-3 border-b-2'>
                        <i className="text-lg ri-map-pin-2-fill"></i>
                        <div>
                            <h3 className='text-lg font-medium'>562/11-A</h3>
                            <p className='text-sm -mt-1 text-gray-600'>{normalizeLocationText(props.ride?.dropLocation || props.ride?.destination)}</p>
                        </div>
                    </div>
                    <div className='flex items-center gap-5 p-3'>
                        <i className="ri-currency-line"></i>
                        <div>
                            <h3 className='text-lg font-medium'>₹{props.ride?.price ?? props.ride?.fare ?? '—'} </h3>
                            <p className='text-sm -mt-1 text-gray-600'>{props.ride?.paymentMethod || 'Cash'}</p>
                        </div>
                    </div>
                </div>

                <div className='mt-10 w-full'>

                    <button
                        onClick={endRide}
                        className='w-full mt-5 flex  text-lg justify-center bg-green-600 text-white font-semibold p-3 rounded-lg'>Finish Ride</button>


                </div>
            </div>
        </div>
    )
}

export default FinishRide