import React, { useRef, useState, useEffect, useContext } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import FinishRide from '../components/FinishRide'
import RideMap from '../components/RideMap'
import LiveTracking from '../components/LiveTracking'
import { getExternalMapsDirBase } from '../config/externalEndpoints'
import { useSocket } from '../hooks/useSocket'
import { CaptainDataContext } from '../context/CaptainContext'
import { RIDE_COMPLETED, LOCATION_UPDATE } from '../constants/rideSocketEvents'
import { getCaptainToken } from '../utils/authTokens'
import { driverBackendJson } from '../services/driverBackendFetch'
import { useDriverLocationSocket } from '../hooks/useDriverLocationSocket'
import { apiClient, withCaptainAuth } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'

const defaultCenter = { lat: 18.5204, lng: 73.8567 }
const LIVE_EMIT_MS = 2000

function geoErrorMessage (err) {
    if (!err) return 'Location unavailable.'
    if (err.code === 1) return 'Location permission denied. Enable location in settings.'
    if (err.code === 2) return 'Location unavailable.'
    if (err.code === 3) return 'Location request timed out.'
    return err.message || 'Location error.'
}

const CaptainRiding = () => {

    const [ finishRidePanel, setFinishRidePanel ] = useState(false)
    const finishRidePanelRef = useRef(null)
    const location = useLocation()
    const navigate = useNavigate()
    const rideData = location.state?.ride
    const startOtp = location.state?.startOtp || ''
    const socket = useSocket()
    const { captain } = useContext(CaptainDataContext)
    const [ passengerLiveCoords, setPassengerLiveCoords ] = useState(null)
    const [ geoError, setGeoError ] = useState('')

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
        const onCompleted = async (payload) => {
            const rid = payload?.rideId != null ? String(payload.rideId) : ''
            if (!rid || rid !== String(rideData._id)) return
            try {
                const res = await apiClient.get(`/rides/${rid}`, withCaptainAuth())
                const data = stripApiEnvelope(res.data)
                let otp = startOtp
                if (!otp) {
                    try {
                        otp = sessionStorage.getItem('rideeasy_last_start_otp') || ''
                    } catch { /* ignore */ }
                }
                navigate('/captain-ride-complete', { state: { ride: data, startOtp: otp } })
            } catch {
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
        const q = new URLSearchParams({ address: rideData.pickupLocation.trim() }).toString()
        driverBackendJson(`/maps/get-coordinates?${q}`)
            .then((data) => {
                if (data?.lat != null && data?.lng != null) setPickupCoords({ lat: data.lat, lng: data.lng })
            })
            .catch(() => {})
    }, [ rideData?.pickupLocation ])

    useEffect(() => {
        if (!rideData?.dropLocation?.trim()) return
        const q = new URLSearchParams({ address: rideData.dropLocation.trim() }).toString()
        driverBackendJson(`/maps/get-coordinates?${q}`)
            .then((data) => {
                if (data?.lat != null && data?.lng != null) setDropCoords({ lat: data.lat, lng: data.lng })
            })
            .catch(() => {})
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

    useDriverLocationSocket(socket, captainId, {
        enabled: !!captainId && !!socket,
        intervalMs: LIVE_EMIT_MS,
        onPosition: (loc) => setCurrentLocation(loc),
        onGeoError: (err) => {
            setGeoError(geoErrorMessage(err))
            setCurrentLocation(defaultCenter)
        },
    })

    // Replaced GSAP with Tailwind transitions for better reliability.

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
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        </span>
                        <span className="truncate text-xs font-medium text-emerald-400">Live location · passenger map</span>
                    </div>
                    {geoError ? (
                        <p role="alert" className="truncate text-[11px] text-amber-300">{geoError}</p>
                    ) : null}
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
            <div ref={finishRidePanelRef} className={`fixed left-0 right-0 mx-auto w-full max-w-[480px] z-[500] bottom-0 rounded-t-3xl border-t border-zinc-800 bg-zinc-950 px-4 pb-10 pt-14 shadow-[0_-12px_48px_rgba(0,0,0,0.55)] max-h-[88dvh] overflow-y-auto transition-transform duration-300 ease-in-out ${finishRidePanel ? 'translate-y-0' : 'translate-y-full'}`}>
                <FinishRide
                    ride={rideData}
                    startOtp={startOtp}
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
