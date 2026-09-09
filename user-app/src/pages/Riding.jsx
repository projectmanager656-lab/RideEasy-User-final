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
import { useLanguage } from '../i18n'

const UPI_PAYEE = import.meta.env.VITE_UPI_PAYEE_NAME || 'RideEasy'

/** Session key written by ChooseRide / SearchingForDriver / Home for the passenger's current ride. */
const USER_RIDE_SESSION_KEY = 'rideeasy_user_ride'

function readSessionRideId () {
    try {
        return sessionStorage.getItem(USER_RIDE_SESSION_KEY) || null
    } catch {
        return null
    }
}

function clearSessionRide () {
    try {
        sessionStorage.removeItem(USER_RIDE_SESSION_KEY)
    } catch { /* ignore */ }
}

const Riding = () => {
    const { t } = useLanguage()
    const location = useLocation()
    const { ride: initialRide } = location.state || {}
    // When the page is opened without ride state (Live tab, refresh, bookmark)
    // the session key still points at the active ride — hydrate it below.
    const [ride, setRide] = useState(() => {
        if (initialRide?._id) return initialRide
        const id = readSessionRideId()
        return id ? { _id: id } : null
    })
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
    const [emergencyContact, setEmergencyContact] = useState(null) // { name, phone, relationship }
    const [ecLoading, setEcLoading] = useState(true)
    const [ecError, setEcError] = useState('')
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
        const st = String(ride?.status || '').trim().toLowerCase()
        if (st === 'started' || st === 'completed') return
        if (!ride?._id || st) {
            // Not a live/completed ride — the guard already rejects invalid
            // state entries, so anything else simply goes back home.
            navigate('/home', { replace: true })
            return
        }
        // Session-only entry (Live tab / refresh): fetch the ride and let the
        // server decide where this ride actually belongs.
        let cancelled = false
        axios
            .get(`${API_BASE_URL}/rides/${ride._id}`, { headers: { Authorization: `Bearer ${token}` } })
            .then((res) => {
                if (cancelled) return
                const doc = res.data
                const next = String(doc?.status || '').trim().toLowerCase()
                if (next === 'started' || next === 'completed') {
                    setRide(doc)
                    return
                }
                if (next === 'cancelled') {
                    clearSessionRide()
                    navigate('/home', { replace: true })
                    return
                }
                // searching / accepted / arrived → belongs on the driver-search screen.
                navigate('/searching-for-driver', { replace: true })
            })
            .catch(() => {
                if (cancelled) return
                clearSessionRide()
                navigate('/home', { replace: true })
            })
        return () => {
            cancelled = true
        }
    }, [ ride?._id, ride?.status, navigate ])
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

    // Fetch emergency contact
    useEffect(() => {
        const fetchEmergencyContact = async () => {
            if (!ride?._id) {
                setEcLoading(false)
                return
            }
            
            setEcLoading(true)
            setEcError('')
            try {
                const token = getPassengerToken()
                const response = await axios.get(`${API_BASE_URL}/users/emergency-contact`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
                setEmergencyContact(response.data.emergencyContact ?? null)
            } catch (err) {
                // If no emergency contact exists, that's okay
                if (err.response?.status === 404) {
                    setEmergencyContact(null)
                } else {
                    setEcError(err.response?.data?.message || err.message || 'Failed to load emergency contact')
                }
            } finally {
                setEcLoading(false)
            }
        }

        fetchEmergencyContact()
    }, [ride?._id])

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
                    const msg = e.response?.data?.message || e.message || t('could_not_refresh_ride')
                    setRideFetchError(msg)
                })
        }
        poll()
        const intervalMs = ride?.status === 'started' ? 4_000 : 12_000
        const id = setInterval(poll, intervalMs)
        return () => clearInterval(id)
    }, [ride?._id, ride?.status, t])

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
                const msg = e.response?.data?.message || e.message || t('could_not_refresh_ride')
                setRideFetchError(msg)
            })
    }, [ride?._id, ride?.status, t])

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
        if (m === 'UPI') return t('upi_online')
        return m
    }, [ride?.paymentMethod, t])

    const confirmRidePayment = useCallback(async (method) => {
        if (!ride?._id) return
        setPaying(true)
        setPayError('')
        try {
            const { data } = await axios.post(`${API_BASE_URL}/rides/pay-mock`, { rideId: ride._id, method, part: 'remaining' }, {
                headers: { Authorization: `Bearer ${getPassengerToken()}` }
            })
            if (data?.ride) setRide(data.ride)
        } catch (e) {
            const message = e.response?.data?.message || e.message || t('payment_failed')
            setPayError(message)
        } finally {
            setPaying(false)
        }
    }, [ride?._id, t])

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
            setRateError(err.response?.data?.message || err.message || t('failed_submit_rating'))
        } finally {
            setSubmittingRating(false)
        }
    }, [ride?._id, t])

    const goHome = useCallback(() => {
        clearSessionRide()
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
            clearSessionRide()
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
            <Link to='/home' className='fixed right-2 top-2 z-10 h-10 w-10 bg-theme-bg/90 border border-theme text-theme-primary flex items-center justify-center rounded-full shadow'>
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
                        {t('open_google_maps')}
                    </button>
                )}
            </div>
            <div className='h-1/2 p-4 bg-theme-bg border-t border-theme text-theme-primary overflow-y-auto rounded-t-3xl'>
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
                        <h2 className='text-lg font-medium capitalize text-theme-primary'>{ride?.captain?.name || ride?.captain?.fullname?.firstname}</h2>
                        <h4 className='text-xl font-semibold -mt-1 -mb-1 text-theme-primary'>{ride?.captain?.vehicleNumber || ride?.captain?.vehicle?.plate}</h4>
                        <p className='text-sm text-theme-secondary capitalize'>{ride?.captain?.vehicleType ? String(ride.captain.vehicleType).toLowerCase() : t('vehicle')}</p>
                    </div>
                </div>

                <div className='flex gap-2 justify-between flex-col items-center'>
                    <div className='w-full mt-5 rounded-xl border border-theme bg-theme-card overflow-hidden'>
                        <div className='flex items-center gap-5 p-3 border-b border-theme'>
                            <i className="text-lg ri-map-pin-user-fill text-emerald-400" aria-hidden />
                            <div className="min-w-0">
                                <h3 className='text-lg font-medium text-theme-primary'>{t('pickup')}</h3>
                                <p className='text-sm -mt-1 text-theme-secondary'>{ride?.pickupLocation || '—'}</p>
                            </div>
                        </div>
                        <div className='flex items-center gap-5 p-3 border-b border-theme'>
                            <i className="text-lg ri-map-pin-2-fill text-rose-400" aria-hidden />
                            <div className="min-w-0">
                                <h3 className='text-lg font-medium text-theme-primary'>{t('drop')}</h3>
                                <p className='text-sm -mt-1 text-theme-secondary'>{ride?.dropLocation || ride?.destination}</p>
                            </div>
                        </div>
                        <div className='flex items-center gap-5 p-3'>
                            <i className="ri-currency-line text-emerald-400"></i>
                            <div>
                                <h3 className='text-lg font-medium text-theme-primary'>₹{ride?.price ?? ride?.fare} </h3>
                                <p className='text-sm -mt-1 text-theme-secondary'>{paymentLabel}</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Emergency Contact Section */}
                {ride?.status === 'started' && (
                    <div className='w-full mt-5 rounded-xl border border-theme bg-theme-card'>
                        <div className='flex items-center gap-4 p-4'>
                            <div className='flex-1'>
                                <h3 className='text-lg font-medium text-theme-primary'>{t('emergency_contact')}</h3>
                                {ecLoading ? (
                                    <p className='text-sm text-theme-secondary'>{t('loading')}</p>
                                ) : ecError ? (
                                    <p className='text-sm text-red-500'>{ecError}</p>
                                ) : emergencyContact ? (
                                    <>
                                        <p className='text-sm font-semibold text-theme-primary mb-1'>{emergencyContact.name}</p>
                                        <p className='text-sm text-theme-primary'>{emergencyContact.phone}</p>
                                        <p className='text-xs text-theme-secondary'>{emergencyContact.relationship}</p>
                                    </>
                                ) : (
                                    <p className='text-sm text-theme-secondary'>{t('emergency_contact_sub')}</p>
                                )}
                            </div>
                            <div className='flex space-x-3'>
                                {!ecLoading && !ecError && emergencyContact ? (
                                    <>
                                        <button
                                            onClick={() => {
                                                if (emergencyContact.phone) {
                                                    window.location.href = `tel:${emergencyContact.phone}`
                                                }
                                            }}
                                            className='flex items-center gap-2 rounded-xl border border-theme bg-theme-card px-3 py-2 text-sm font-semibold text-theme-secondary hover:bg-theme-card-muted'
                                        >
                                            <i className="ri-phone-line text-lg" />
                                            {t('call')}
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (emergencyContact.phone) {
                                                    const rideDetails = {
                                                        driverName: ride?.captain?.name || 'Driver',
                                                        vehicleInfo: `${ride?.captain?.vehicleType || 'Vehicle'} ${ride?.captain?.vehicleNumber || ''}`,
                                                        pickup: ride?.pickupLocation || '—',
                                                        destination: ride?.dropLocation || ride?.destination || '—',
                                                        status: ride?.status || '—',
                                                        eta: ride?.eta || 'Calculating...',
                                                        rideId: ride?._id || '—'
                                                    }
                                                    const message = `RideEasy Emergency Alert: I'm currently in a ride and need to share my ride details for safety.\n\nDriver: ${rideDetails.driverName}\nVehicle: ${rideDetails.vehicleInfo}\nPickup: ${rideDetails.pickup}\nDestination: ${rideDetails.destination}\nStatus: ${rideDetails.status}\nETA: ${rideDetails.eta}\nRide ID: ${rideDetails.rideId}\n\nPlease check on me if needed.`
                                                    window.location.href = `https://wa.me/${emergencyContact.phone}?text=${encodeURIComponent(message)}`
                                                }
                                            }}
                                            className='flex items-center gap-2 rounded-xl border border-theme bg-theme-card px-3 py-2 text-sm font-semibold text-theme-secondary hover:bg-theme-card-muted'
                                        >
                                            <i className="ri-chat-3-line text-lg" />
                                            {t('share')}
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => navigate('/emergency-contact')}
                                        className='flex items-center gap-2 rounded-xl border border-theme bg-theme-card px-3 py-2 text-sm font-semibold text-theme-secondary hover:bg-theme-card-muted'
                                    >
                                        <i className="ri-add-line text-lg" />
                                        {t('add_contact')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                
                <button className='w-full mt-5 rounded-xl border border-theme bg-theme-card-muted text-theme-secondary font-semibold p-3' disabled>
                    {t('payment_receipt_when_ends')}
                </button>
            </div>
        </div>
    )
}

export default Riding
