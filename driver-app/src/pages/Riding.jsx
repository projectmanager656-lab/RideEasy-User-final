import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useSocket } from '../hooks/useSocket'
import RideMap from '../components/RideMap'
import LiveTracking from '../components/LiveTracking'
import RideStatusStepper from '../components/RideStatusStepper'
import { API_BASE_URL } from '../config/apiBaseUrl'
import { getExternalMapsDirBase } from '../config/externalEndpoints'
import { getPassengerToken } from '../utils/authTokens'
import { RIDE_STARTED, RIDE_COMPLETED, LOCATION_UPDATE } from '../constants/rideSocketEvents'

const UPI_PAYEE = import.meta.env.VITE_UPI_PAYEE_NAME || 'RideEasy'

const Riding = () => {
    const location = useLocation()
    const { ride: initialRide } = location.state || {}
    const [ride, setRide] = useState(initialRide)
    const [pickupCoords, setPickupCoords] = useState(null)
    const [dropCoords, setDropCoords] = useState(null)
    const [driverCoords, setDriverCoords] = useState(() => {
        const loc = initialRide?.captain?.location
        if (loc?.coordinates?.length === 2) {
            return { lng: loc.coordinates[0], lat: loc.coordinates[1] }
        }
        return null
    })
    const [passengerLiveCoords, setPassengerLiveCoords] = useState(null)
    const socket = useSocket()
    const navigate = useNavigate()
    const rideIdRef = useRef(null)
    rideIdRef.current = ride?._id
    const lastSocketDriverAtRef = useRef(0)

    useEffect(() => {
        const token = getPassengerToken()
        if (!token) {
            navigate('/login', { replace: true })
            return
        }
        if (!initialRide?._id) {
            navigate('/home', { replace: true })
        }
    }, [ initialRide?._id, navigate ])
    const [paying, setPaying] = useState(false)
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('Cash')
    const [rating, setRating] = useState(0)
    const [comment, setComment] = useState('')
    const [submittingRating, setSubmittingRating] = useState(false)

    useEffect(() => {
        if (!socket) return
        const applyDriverLoc = (incomingRid, lat, lng, atMs) => {
            const rid = rideIdRef.current
            const inc = incomingRid != null ? String(incomingRid) : ''
            const cur = rid != null ? String(rid) : ''
            if (inc && cur && inc !== cur) return
            if (lat == null || lng == null) return
            lastSocketDriverAtRef.current = typeof atMs === 'number' ? atMs : Date.now()
            setDriverCoords({ lat: Number(lat), lng: Number(lng) })
        }
        const onStatusUpdate = (data) => {
            if (!data) return
            const rid = rideIdRef.current
            if (data?.rideId && rid && String(data.rideId) !== String(rid)) return
            if (data?.status) {
                setRide((prev) => {
                    if (data.ride) return { ...(prev || {}), ...data.ride, status: data.status }
                    return { ...(prev || {}), status: data.status }
                })
            }
            if (data?.driverLocation?.lat != null && data?.driverLocation?.lng != null) {
                applyDriverLoc(data.rideId, data.driverLocation.lat, data.driverLocation.lng, Date.now())
            }
        }
        const onLocationUpdate = (payload) => {
            if (!payload || payload.source === 'passenger') return
            applyDriverLoc(payload.rideId, payload.lat, payload.lng, payload.at)
        }
        const onRideStarted = (data) => {
            if (!data) return
            onStatusUpdate({
                rideId: data.rideId,
                status: 'started',
                ride: data.ride,
            })
        }
        const onRideCompleted = (data) => {
            if (!data) return
            onStatusUpdate({
                rideId: data.rideId,
                status: 'completed',
                ride: data.ride,
            })
        }
        socket.on('ride:status-update', onStatusUpdate)
        socket.on(LOCATION_UPDATE, onLocationUpdate)
        socket.on(RIDE_STARTED, onRideStarted)
        socket.on(RIDE_COMPLETED, onRideCompleted)
        return () => {
            socket.off('ride:status-update', onStatusUpdate)
            socket.off(LOCATION_UPDATE, onLocationUpdate)
            socket.off(RIDE_STARTED, onRideStarted)
            socket.off(RIDE_COMPLETED, onRideCompleted)
        }
    }, [socket])

    useEffect(() => {
        const uid = ride?.user?._id || ride?.user
        if (socket && uid) {
            socket.emit('join', { userType: 'user', userId: uid })
        }
    }, [socket, ride?.user])

    useEffect(() => {
        if (ride?.status !== 'started' || !socket || !navigator.geolocation) {
            if (ride?.status !== 'started') setPassengerLiveCoords(null)
            return
        }
        let emitTimer
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = pos.coords.latitude
                const lng = pos.coords.longitude
                setPassengerLiveCoords({ lat, lng })
                clearTimeout(emitTimer)
                emitTimer = setTimeout(() => {
                    socket.emit('user:location-update', { lat, lng })
                }, 800)
            },
            () => {},
            { enableHighAccuracy: true, maximumAge: 10_000 }
        )
        return () => {
            clearTimeout(emitTimer)
            navigator.geolocation.clearWatch(watchId)
        }
    }, [socket, ride?.status])

    useEffect(() => {
        if (!ride?.pickupLocation?.trim()) return
        axios.get(`${API_BASE_URL}/maps/get-coordinates`, {
            params: { address: ride.pickupLocation.trim() },
            headers: { Authorization: `Bearer ${getPassengerToken()}` }
        }).then((res) => {
            if (res.data?.lat != null && res.data?.lng != null) setPickupCoords({ lat: res.data.lat, lng: res.data.lng })
        }).catch(() => {})
    }, [ride?.pickupLocation])

    useEffect(() => {
        if (!ride?.dropLocation?.trim()) return
        axios.get(`${API_BASE_URL}/maps/get-coordinates`, {
            params: { address: ride.dropLocation.trim() },
            headers: { Authorization: `Bearer ${getPassengerToken()}` }
        }).then((res) => {
            if (res.data?.lat != null && res.data?.lng != null) setDropCoords({ lat: res.data.lat, lng: res.data.lng })
        }).catch(() => {})
    }, [ride?.dropLocation])

    useEffect(() => {
        if (!ride?._id) return
        if (![ 'accepted', 'arrived', 'started', 'completed' ].includes(ride?.status)) return
        const token = getPassengerToken()
        const poll = () => {
            axios.get(`${API_BASE_URL}/rides/${ride._id}`, { headers: { Authorization: `Bearer ${token}` } })
                .then((res) => {
                    setRide(res.data)
                    const st = res.data?.status
                    /* Avoid overwriting fresher Socket.IO driver positions with slower REST snapshots */
                    if ([ 'accepted', 'arrived', 'started' ].includes(st)) {
                        const fresh = Date.now() - lastSocketDriverAtRef.current < 12_000
                        if (fresh) return
                    }
                    const loc = res.data?.captain?.location
                    if (loc?.coordinates?.length === 2) {
                        setDriverCoords({ lat: loc.coordinates[1], lng: loc.coordinates[0] })
                    }
                })
                .catch(() => {})
        }
        poll()
        const id = setInterval(poll, 12_000)
        return () => clearInterval(id)
    }, [ride?._id, ride?.status])

    const openInGoogleMaps = () => {
        const dest = dropCoords || (ride?.dropLocation ? encodeURIComponent(ride.dropLocation) : null)
        const origin = driverCoords ? `${driverCoords.lat},${driverCoords.lng}` : (ride?.pickupLocation ? encodeURIComponent(ride.pickupLocation) : '')
        if (!dest) return
        const destStr = typeof dest === 'string' ? dest : `${dest.lat},${dest.lng}`
        const url = `${getExternalMapsDirBase()}/?api=1&destination=${destStr}&origin=${origin || ''}&travelmode=driving`
        window.open(url, '_blank', 'noopener,noreferrer')
    }

    const showRideMap = pickupCoords && dropCoords
    const trackingDriverToDrop =
        ride?.status === 'started'
        && driverCoords?.lat != null
        && dropCoords?.lat != null
    const showPayment = ride?.status === 'completed'
    const paid = ride?.paymentStatus === 'success'
    const canRate = showPayment && paid && (ride?.rating == null)

    const paymentLabel = useMemo(() => {
        const m = ride?.paymentMethod || 'Cash'
        if (m === 'UPI') return 'UPI / Online'
        return m
    }, [ride?.paymentMethod])

    const confirmRidePayment = async (method) => {
        if (!ride?._id) return
        setPaying(true)
        try {
            const { data } = await axios.post(`${API_BASE_URL}/rides/pay-mock`, { rideId: ride._id, method }, {
                headers: { Authorization: `Bearer ${getPassengerToken()}` }
            })
            setRide(data.ride)
        } catch (e) {
            const message = e.response?.data?.message || 'Payment failed'
            alert(message)
        } finally {
            setPaying(false)
        }
    }

    const submitRating = async (value) => {
        if (!ride?._id) return
        setSubmittingRating(true)
        try {
            const token = getPassengerToken()
            const res = await axios.post(`${API_BASE_URL}/rides/rate`, {
                rideId: ride._id,
                rating: value,
                comment: comment.trim(),
            }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            setRide(res.data)
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to submit rating')
        } finally {
            setSubmittingRating(false)
        }
    }

    return (
        <div className='h-screen'>
            <Link to='/home' className='fixed right-2 top-2 z-10 h-10 w-10 bg-white flex items-center justify-center rounded-full shadow'>
                <i className="text-lg font-medium ri-home-5-line"></i>
            </Link>
            <div className='h-1/2 relative'>
                {showRideMap ? (
                    <RideMap
                        pickupCoords={pickupCoords}
                        dropCoords={dropCoords}
                        driverCoords={driverCoords}
                        passengerLiveCoords={passengerLiveCoords}
                        showRoute
                        trackingFrom={trackingDriverToDrop ? driverCoords : null}
                        trackingTo={trackingDriverToDrop ? dropCoords : null}
                    />
                ) : (
                    <LiveTracking />
                )}
                {showRideMap && (
                    <button
                        type="button"
                        onClick={openInGoogleMaps}
                        className="absolute bottom-3 left-3 right-3 z-10 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg shadow flex items-center justify-center gap-2"
                    >
                        <i className="ri-navigation-line" />
                        Open in Google Maps
                    </button>
                )}
            </div>
            <div className='h-1/2 p-4 bg-white text-slate-900 overflow-y-auto'>
                <div className="mb-4">
                    <RideStatusStepper status={ride?.status || 'accepted'} />
                </div>
                <div className='flex items-center justify-between gap-3'>
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg font-semibold text-emerald-800" aria-hidden>
                        {(ride?.captain?.name || ride?.captain?.fullname?.firstname || 'D').toString().charAt(0)}
                    </div>
                    <div className='text-right min-w-0'>
                        <h2 className='text-lg font-medium capitalize'>{ride?.captain?.name || ride?.captain?.fullname?.firstname}</h2>
                        <h4 className='text-xl font-semibold -mt-1 -mb-1'>{ride?.captain?.vehicleNumber || ride?.captain?.vehicle?.plate}</h4>
                        <p className='text-sm text-gray-600 capitalize'>{ride?.captain?.vehicleType ? String(ride.captain.vehicleType).toLowerCase() : 'Vehicle'}</p>
                    </div>
                </div>

                <div className='flex gap-2 justify-between flex-col items-center'>
                    <div className='w-full mt-5'>
                        <div className='flex items-center gap-5 p-3 border-b-2'>
                            <i className="text-lg ri-map-pin-2-fill"></i>
                            <div>
                                <h3 className='text-lg font-medium'>Drop</h3>
                                <p className='text-sm -mt-1 text-gray-600'>{ride?.dropLocation || ride?.destination}</p>
                            </div>
                        </div>
                        <div className='flex items-center gap-5 p-3'>
                            <i className="ri-currency-line"></i>
                            <div>
                                <h3 className='text-lg font-medium'>₹{ride?.price ?? ride?.fare} </h3>
                                <p className='text-sm -mt-1 text-gray-600'>{paymentLabel}</p>
                            </div>
                        </div>
                    </div>
                </div>
                {showPayment ? (
                    <div className="mt-4 space-y-3">
                        {!paid && (
                            <>
                                <p className="text-sm font-medium text-slate-700">Select payment method</p>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        disabled={paying}
                                        onClick={() => setSelectedPaymentMethod('Cash')}
                                        className={`py-2 rounded-lg text-sm border ${selectedPaymentMethod === 'Cash' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}
                                    >
                                        Cash
                                    </button>
                                    <button
                                        type="button"
                                        disabled={paying}
                                        onClick={() => setSelectedPaymentMethod('UPI')}
                                        className={`py-2 rounded-lg text-sm border ${selectedPaymentMethod === 'UPI' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}
                                    >
                                        UPI
                                    </button>
                                    <button
                                        type="button"
                                        disabled={paying}
                                        onClick={() => setSelectedPaymentMethod('Online')}
                                        className={`py-2 rounded-lg text-sm border ${selectedPaymentMethod === 'Online' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}
                                    >
                                        Online
                                    </button>
                                </div>

                                {(selectedPaymentMethod === 'UPI' || selectedPaymentMethod === 'Online') && (
                                    <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                                        UPI / online payee: <span className="font-semibold">{UPI_PAYEE}</span>
                                        <p className="mt-1 text-xs text-slate-500">Online is processed like UPI on the server until a payment gateway is connected.</p>
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        disabled={paying}
                                        onClick={() => confirmRidePayment(selectedPaymentMethod)}
                                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-sm font-semibold"
                                    >
                                        {paying ? 'Processing...' : `Pay Now (${selectedPaymentMethod})`}
                                    </button>
                                </div>
                            </>
                        )}
                        {paid && (
                            <div className="rounded-lg border border-slate-200 p-3">
                                <div className="text-sm font-semibold mb-2">Rate your driver (1–5)</div>
                                <textarea
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    className="w-full border rounded-lg p-2 text-sm mb-2"
                                    placeholder="Comment (optional)"
                                    rows={2}
                                />
                                <div className="flex items-center gap-2">
                                    {[1,2,3,4,5].map((v) => (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() => { setRating(v); if (canRate) submitRating(v) }}
                                            disabled={submittingRating || !canRate}
                                            className={`h-10 w-10 rounded-lg border text-lg ${ (ride?.rating ?? rating) >= v ? 'bg-amber-400 border-amber-500' : 'bg-white border-slate-200' }`}
                                        >
                                            ★
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-2 text-xs text-slate-600">
                                    {ride?.rating ? `Thanks! You rated ${ride.rating}/5` : 'Pay केल्यानंतर star द्या.'}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => navigate('/home')}
                                    className="mt-3 w-full bg-slate-900 text-white font-semibold p-3 rounded-lg"
                                >
                                    Back to Home
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <button className='w-full mt-5 bg-slate-900 text-white font-semibold p-3 rounded-lg' disabled>
                        Payment after ride completion
                    </button>
                )}
            </div>
        </div>
    )
}

export default Riding
