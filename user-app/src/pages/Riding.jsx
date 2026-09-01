import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useSocket } from '../hooks/useSocket'
import RideMap from '../components/RideMap'
import LiveTracking from '../components/LiveTracking'
import RideStatusStepper from '../components/RideStatusStepper'
import RideCompletionFlow from '../components/ride/RideCompletionFlow'
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
    const completedSyncDoneForId = useRef(null)

    useEffect(() => {
        const token = getPassengerToken()
        if (!token) {
            navigate('/login', { replace: true })
            return
        }
        const st = String(initialRide?.status || '').trim().toLowerCase()
        const allowed = st === 'started' || st === 'completed'
        if (!initialRide?._id || !allowed) {
            navigate('/home', { replace: true })
        }
    }, [ initialRide?._id, initialRide?.status, navigate ])
    const [paying, setPaying] = useState(false)
    const [payError, setPayError] = useState('')
    const [rateError, setRateError] = useState('')
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('Cash')
    const [submittingRating, setSubmittingRating] = useState(false)
    const [rideFetchError, setRideFetchError] = useState('')

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
        if (!ride?._id || ride?.status === 'completed') return
        if (![ 'accepted', 'arrived', 'started' ].includes(ride?.status)) return
        const token = getPassengerToken()
        const poll = () => {
            axios.get(`${API_BASE_URL}/rides/${ride._id}`, { headers: { Authorization: `Bearer ${token}` } })
                .then((res) => {
                    setRideFetchError('')
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
                .catch((e) => {
                    const msg = e.response?.data?.message || e.message || 'Could not refresh ride'
                    setRideFetchError(msg)
                })
        }
        poll()
        const intervalMs = ride?.status === 'started' ? 4_000 : 12_000
        const id = setInterval(poll, intervalMs)
        return () => clearInterval(id)
    }, [ride?._id, ride?.status])

    useEffect(() => {
        if (ride?.status !== 'completed' || !ride?._id) return
        if (completedSyncDoneForId.current === ride._id) return
        completedSyncDoneForId.current = ride._id
        const token = getPassengerToken()
        axios
            .get(`${API_BASE_URL}/rides/${ride._id}`, { headers: { Authorization: `Bearer ${token}` } })
            .then((res) => {
                setRideFetchError('')
                setRide(res.data)
            })
            .catch((e) => {
                const msg = e.response?.data?.message || e.message || 'Could not refresh ride'
                setRideFetchError(msg)
            })
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
    const paymentLabel = useMemo(() => {
        const m = ride?.paymentMethod || 'Cash'
        if (m === 'UPI') return 'UPI / Online'
        return m
    }, [ride?.paymentMethod])

    const confirmRidePayment = useCallback(async (method) => {
        if (!ride?._id) return
        setPaying(true)
        setPayError('')
        try {
            const { data } = await axios.post(`${API_BASE_URL}/rides/pay-mock`, { rideId: ride._id, method }, {
                headers: { Authorization: `Bearer ${getPassengerToken()}` }
            })
            if (data?.ride) setRide(data.ride)
        } catch (e) {
            const message = e.response?.data?.message || e.message || 'Payment failed'
            setPayError(message)
        } finally {
            setPaying(false)
        }
    }, [ride?._id])

    const submitRating = useCallback(async (value, comment) => {
        if (!ride?._id) return
        setSubmittingRating(true)
        setRateError('')
        try {
            const res = await axios.post(`${API_BASE_URL}/rides/rate`, {
                rideId: ride._id,
                rating: value,
                comment: comment || '',
            }, {
                headers: { Authorization: `Bearer ${getPassengerToken()}` }
            })
            setRide(res.data)
        } catch (err) {
            setRateError(err.response?.data?.message || err.message || 'Failed to submit rating')
        } finally {
            setSubmittingRating(false)
        }
    }, [ride?._id])

    const goHome = useCallback(() => {
        navigate('/home', { replace: true })
    }, [navigate])

    /*
     * Completion redirect: the old fixed 2.5s timer kicked the user home before
     * they could rate the driver or open the invoice. The RideCompletionFlow
     * handles its own countdown + "Book another ride" once completed; we keep a
     * long safety net here so a user who leaves the completion flow open still
     * ends up back on Home — without being yanked mid-interaction.
     */
    useEffect(() => {
        if (ride?.status !== 'completed') return
        const t = setTimeout(() => {
            navigate('/home', { replace: true })
        }, 120000)
        return () => clearTimeout(t)
    }, [ride?.status, navigate])

    if (ride?.status === 'completed') {
        return (
            <RideCompletionFlow
                ride={ride}
                paying={paying}
                submittingRating={submittingRating}
                payError={payError}
                rateError={rateError}
                selectedPaymentMethod={selectedPaymentMethod}
                onSelectPayment={setSelectedPaymentMethod}
                onPay={confirmRidePayment}
                onSubmitRating={submitRating}
                onHome={goHome}
                UPI_PAYEE={UPI_PAYEE}
            />
        )
    }

    return (
        <div className='h-screen'>
            <Link to='/home' className='fixed right-2 top-2 z-10 h-10 w-10 bg-zinc-900 border border-zinc-700 text-white flex items-center justify-center rounded-full shadow'>
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
            <div className='h-1/2 p-4 bg-zinc-950 border-t border-zinc-800 text-zinc-100 overflow-y-auto rounded-t-3xl'>
                {rideFetchError ? (
                    <div role="alert" className="mb-3 rounded-lg border border-red-800/80 bg-red-950/50 px-3 py-2 text-sm text-red-200">
                        {rideFetchError}
                    </div>
                ) : null}
                <div className="mb-4">
                    <RideStatusStepper status={ride?.status || 'accepted'} />
                </div>
                <div className='flex items-center justify-between gap-3'>
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-900/60 text-lg font-semibold text-emerald-200 ring-1 ring-emerald-700/50" aria-hidden>
                        {(ride?.captain?.name || ride?.captain?.fullname?.firstname || 'D').toString().charAt(0)}
                    </div>
                    <div className='text-right min-w-0'>
                        <h2 className='text-lg font-medium capitalize text-white'>{ride?.captain?.name || ride?.captain?.fullname?.firstname}</h2>
                        <h4 className='text-xl font-semibold -mt-1 -mb-1 text-zinc-100'>{ride?.captain?.vehicleNumber || ride?.captain?.vehicle?.plate}</h4>
                        <p className='text-sm text-zinc-400 capitalize'>{ride?.captain?.vehicleType ? String(ride.captain.vehicleType).toLowerCase() : 'Vehicle'}</p>
                    </div>
                </div>

                <div className='flex gap-2 justify-between flex-col items-center'>
                    <div className='w-full mt-5 rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden'>
                        <div className='flex items-center gap-5 p-3 border-b border-zinc-800'>
                            <i className="text-lg ri-map-pin-user-fill text-emerald-400" aria-hidden />
                            <div className="min-w-0">
                                <h3 className='text-lg font-medium text-white'>Pickup</h3>
                                <p className='text-sm -mt-1 text-zinc-400'>{ride?.pickupLocation || '—'}</p>
                            </div>
                        </div>
                        <div className='flex items-center gap-5 p-3 border-b border-zinc-800'>
                            <i className="text-lg ri-map-pin-2-fill text-rose-400" aria-hidden />
                            <div className="min-w-0">
                                <h3 className='text-lg font-medium text-white'>Drop</h3>
                                <p className='text-sm -mt-1 text-zinc-400'>{ride?.dropLocation || ride?.destination}</p>
                            </div>
                        </div>
                        <div className='flex items-center gap-5 p-3'>
                            <i className="ri-currency-line text-emerald-400"></i>
                            <div>
                                <h3 className='text-lg font-medium text-white'>₹{ride?.price ?? ride?.fare} </h3>
                                <p className='text-sm -mt-1 text-zinc-400'>{paymentLabel}</p>
                            </div>
                        </div>
                    </div>
                </div>
                <button className='w-full mt-5 rounded-xl border border-zinc-700 bg-zinc-900/60 text-zinc-400 font-semibold p-3' disabled>
                    Payment & receipt when the driver ends the ride
                </button>
            </div>
        </div>
    )
}

export default Riding
