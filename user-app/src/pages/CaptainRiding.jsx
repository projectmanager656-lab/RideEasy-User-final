import React, { useRef, useState, useEffect, useContext } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import FinishRide from '../components/FinishRide'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import RideMap from '../components/RideMap'
import LiveTracking from '../components/LiveTracking'
import { API_BASE_URL } from '../config/apiBaseUrl'
import { getExternalMapsDirBase } from '../config/externalEndpoints'
import { useSocket } from '../hooks/useSocket'
import { CaptainDataContext } from '../context/CaptainContext'
import { RIDE_COMPLETED, LOCATION_UPDATE } from '../constants/rideSocketEvents'
import { getCaptainToken } from '../utils/authTokens'

const defaultCenter = { lat: 18.5204, lng: 73.8567 }
const LIVE_EMIT_MS = 2000

const CaptainRiding = () => {

    const [ finishRidePanel, setFinishRidePanel ] = useState(false)
    const finishRidePanelRef = useRef(null)
    const location = useLocation()
    const navigate = useNavigate()
    const rideData = location.state?.ride
    const socket = useSocket()
    const { captain } = useContext(CaptainDataContext)
    const [ passengerLiveCoords, setPassengerLiveCoords ] = useState(null)

    useEffect(() => {
        const token = getCaptainToken()
        if (!token) {
            navigate('/captain-login', { replace: true })
            return
        }
        if (!rideData?._id) {
            navigate('/captain-home', { replace: true })
        }
    }, [ rideData?._id, navigate ])

    useEffect(() => {
        if (!socket || !rideData?._id) return
        const onCompleted = (payload) => {
            const rid = payload?.rideId != null ? String(payload.rideId) : ''
            if (rid && rid === String(rideData._id)) {
                navigate('/captain-home', { replace: true })
            }
        }
        socket.on(RIDE_COMPLETED, onCompleted)
        return () => {
            socket.off(RIDE_COMPLETED, onCompleted)
        }
    }, [socket, rideData?._id, navigate])

    useEffect(() => {
        if (!socket || !rideData?._id) return
        const onPassengerLoc = (payload) => {
            if (payload?.source !== 'passenger') return
            if (payload?.rideId == null || String(payload.rideId) !== String(rideData._id)) return
            if (payload.lat == null || payload.lng == null) return
            setPassengerLiveCoords({ lat: Number(payload.lat), lng: Number(payload.lng) })
        }
        socket.on(LOCATION_UPDATE, onPassengerLoc)
        return () => socket.off(LOCATION_UPDATE, onPassengerLoc)
    }, [socket, rideData?._id])

    const [ pickupCoords, setPickupCoords ] = useState(null)
    const [ dropCoords, setDropCoords ] = useState(null)
    const [ currentLocation, setCurrentLocation ] = useState(null)

    useEffect(() => {
        if (!rideData?.pickupLocation?.trim()) return
        axios.get(`${API_BASE_URL}/maps/get-coordinates`, {
            params: { address: rideData.pickupLocation.trim() },
            headers: { Authorization: `Bearer ${getCaptainToken()}` }
        }).then((res) => {
            if (res.data?.lat != null && res.data?.lng != null) setPickupCoords({ lat: res.data.lat, lng: res.data.lng })
        }).catch(() => {})
    }, [ rideData?.pickupLocation ])

    useEffect(() => {
        if (!rideData?.dropLocation?.trim()) return
        axios.get(`${API_BASE_URL}/maps/get-coordinates`, {
            params: { address: rideData.dropLocation.trim() },
            headers: { Authorization: `Bearer ${getCaptainToken()}` }
        }).then((res) => {
            if (res.data?.lat != null && res.data?.lng != null) setDropCoords({ lat: res.data.lat, lng: res.data.lng })
        }).catch(() => {})
    }, [ rideData?.dropLocation ])

    const captainId =
        captain?._id != null
            ? String(captain._id)
            : (() => {
                const c = rideData?.captain
                if (c == null) return ''
                if (typeof c === 'object' && c._id != null) return String(c._id)
                if (typeof c === 'string' && c.length) return c
                return ''
            })()

    useEffect(() => {
        if (!socket || !captainId) return
        const doJoin = () => {
            socket.emit('join', { userId: captainId, userType: 'captain' })
            socket.emit('join-driver', {
                driverId: captainId,
                city: captain?.city || rideData?.city || 'Kolhapur',
            })
        }
        doJoin()
        socket.on('connect', doJoin)
        return () => {
            socket.off('connect', doJoin)
        }
    }, [socket, captainId, captain?.city, rideData?.city])

    useEffect(() => {
        if (!socket || !captainId || !navigator.geolocation) return
        let emitTimer
        const updatePos = (position) => {
            const { latitude, longitude } = position.coords
            setCurrentLocation({ lat: latitude, lng: longitude })
            clearTimeout(emitTimer)
            emitTimer = setTimeout(() => {
                socket.emit('driver:location-update', {
                    driverId: captainId,
                    lat: latitude,
                    lng: longitude,
                })
            }, LIVE_EMIT_MS)
        }
        navigator.geolocation.getCurrentPosition(updatePos, () => setCurrentLocation(defaultCenter), { enableHighAccuracy: true, maximumAge: 10_000 })
        const watchId = navigator.geolocation.watchPosition(updatePos, () => {}, { enableHighAccuracy: true, maximumAge: 5000 })
        return () => {
            clearTimeout(emitTimer)
            navigator.geolocation.clearWatch(watchId)
        }
    }, [socket, captainId])



    useGSAP(function () {
        if (finishRidePanel) {
            gsap.to(finishRidePanelRef.current, {
                transform: 'translateY(0)'
            })
        } else {
            gsap.to(finishRidePanelRef.current, {
                transform: 'translateY(100%)'
            })
        }
    }, [ finishRidePanel ])

    const openInGoogleMaps = () => {
        const dest = dropCoords || (rideData?.dropLocation ? encodeURIComponent(rideData.dropLocation) : null)
        const origin = currentLocation ? `${currentLocation.lat},${currentLocation.lng}` : (rideData?.pickupLocation ? encodeURIComponent(rideData.pickupLocation) : '')
        if (!dest) return
        const destStr = typeof dest === 'string' ? dest : `${dest.lat},${dest.lng}`
        const waypoints = pickupCoords && currentLocation ? `&waypoints=${pickupCoords.lat},${pickupCoords.lng}` : ''
        const url = `${getExternalMapsDirBase()}/?api=1&destination=${destStr}&origin=${origin || ''}&travelmode=driving${waypoints}`
        window.open(url, '_blank', 'noopener,noreferrer')
    }

    const showRideMap = pickupCoords && dropCoords

    return (
        <div className='h-screen relative flex flex-col justify-end bg-slate-950'>

            <div className='fixed left-0 right-0 top-0 z-[400] flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-4 py-2.5 backdrop-blur'>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </span>
                    <span className="truncate text-xs font-medium text-emerald-400">Live location · passenger map</span>
                </div>
                <Link
                    to='/captain-home'
                    className='shrink-0 rounded-full bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700'
                >
                    Dashboard
                </Link>
            </div>

            <div className='h-1/5 p-6 flex items-center justify-between relative bg-yellow-400 pt-10'
                onClick={() => {
                    setFinishRidePanel(true)
                }}
            >
                <h5 className='p-1 text-center w-[90%] absolute top-0'><i className="text-3xl text-gray-800 ri-arrow-up-wide-line"></i></h5>
                <h4 className='text-xl font-semibold'>Route to drop</h4>
                <div className='flex items-center gap-2'>
                    {showRideMap && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); openInGoogleMaps(); }} className='bg-slate-700 hover:bg-slate-800 text-white font-semibold p-3 px-5 rounded-lg flex items-center gap-2'>
                            <i className="ri-navigation-line" /> Navigate
                        </button>
                    )}
                    <button type="button" onClick={(e) => { e.stopPropagation(); setFinishRidePanel(true); }} className='bg-green-600 text-white font-semibold p-3 px-10 rounded-lg'>Complete Ride</button>
                </div>
            </div>
            <div ref={finishRidePanelRef} className='fixed w-full z-[500] bottom-0 translate-y-full bg-white px-3 py-10 pt-12'>
                <FinishRide
                    ride={rideData}
                    setFinishRidePanel={setFinishRidePanel} />
            </div>

            <div className='h-screen fixed w-screen top-0 z-[-1]'>
                {showRideMap ? (
                    <RideMap
                        pickupCoords={pickupCoords}
                        dropCoords={dropCoords}
                        currentLocation={currentLocation}
                        driverCoords={currentLocation}
                        passengerLiveCoords={passengerLiveCoords}
                        showRoute
                        routeFromCurrent
                    />
                ) : (
                    <LiveTracking />
                )}
            </div>

        </div>
    )
}

export default CaptainRiding