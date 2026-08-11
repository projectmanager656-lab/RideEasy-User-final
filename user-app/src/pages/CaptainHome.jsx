import React, { useRef, useState, useEffect, useContext, useMemo } from 'react'
import { Link } from 'react-router-dom'
import CaptainDetails from '../components/CaptainDetails'
import RidePopUp from '../components/RidePopUp'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import ConfirmRidePopUp from '../components/ConfirmRidePopUp'
import { useSocket } from '../hooks/useSocket'
import { CaptainDataContext } from '../context/CaptainContext'
import LiveTracking from '../components/LiveTracking'
import RideMap from '../components/RideMap'
import axios from 'axios'
import { API_BASE_URL } from '../config/apiBaseUrl'
import { RIDE_REQUEST, RIDE_COMPLETED, LOCATION_UPDATE } from '../constants/rideSocketEvents'
import { stripApiEnvelope } from '../utils/apiBody'
import { getCaptainToken } from '../utils/authTokens'

const LOCATION_EMIT_MS = 2000
const PENDING_POLL_MS = 4000

const CaptainHome = () => {
    const [ ridePopupPanel, setRidePopupPanel ] = useState(false)
    const [ confirmRidePopupPanel, setConfirmRidePopupPanel ] = useState(false)
    const [, setPendingRides ] = useState([])
    const [ subscriptionStatus, setSubscriptionStatus ] = useState(null)
    const ridePopupPanelRef = useRef(null)
    const confirmRidePopupPanelRef = useRef(null)
    const [ ride, setRide ] = useState(null)
    const [ passengerLiveCoords, setPassengerLiveCoords ] = useState(null)
    const [ captainGps, setCaptainGps ] = useState(null)
    const activeRideIdRef = useRef(null)
    const socket = useSocket()
    const { captain } = useContext(CaptainDataContext)

    const ridePopupOpenRef = useRef(false)
    const confirmRideOpenRef = useRef(false)
    const captainOnlineRef = useRef(false)
    ridePopupOpenRef.current = ridePopupPanel
    confirmRideOpenRef.current = confirmRidePopupPanel
    activeRideIdRef.current = ride?._id != null ? String(ride._id) : null
    captainOnlineRef.current = captain?.status === 'active'

    const rideMapCoords = useMemo(() => {
        if (!ride?.pickup?.coordinates || ride.pickup.coordinates.length < 2) {
            return { pickup: null, drop: null }
        }
        const [ plng, plat ] = ride.pickup.coordinates
        const d = ride.drop?.coordinates
        return {
            pickup: { lat: plat, lng: plng },
            drop: Array.isArray(d) && d.length >= 2 ? { lat: d[1], lng: d[0] } : null,
        }
    }, [ride])

    useEffect(() => {
        if (!ride?._id) {
            setPassengerLiveCoords(null)
            setCaptainGps(null)
            return
        }
        if (!navigator.geolocation) return
        const id = navigator.geolocation.watchPosition(
            (p) => setCaptainGps({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => {},
            { enableHighAccuracy: true, maximumAge: 10_000 }
        )
        return () => navigator.geolocation.clearWatch(id)
    }, [ride?._id])

    useEffect(() => {
        if (!socket || !captain?._id) return
        const capId = String(captain._id)
        const online = captain?.status === 'active'

        if (!online) {
            return undefined
        }

        const city = captain.city || 'Kolhapur'
        const doJoin = () => {
            socket.emit('join', { userId: capId, userType: 'captain' })
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        socket.emit('join-driver', {
                            driverId: capId,
                            city,
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude,
                        })
                    },
                    () => {
                        socket.emit('join-driver', { driverId: capId, city, lat: 16.705, lng: 74.243 })
                    }
                )
            } else {
                socket.emit('join-driver', { driverId: capId, city, lat: 16.705, lng: 74.243 })
            }
        }
        doJoin()
        socket.on('connect', doJoin)
        const token = getCaptainToken()
        const fetchPending = () => axios.get(`${API_BASE_URL}/rides/pending`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            params: { _ts: Date.now() },
        })
            .then((res) => {
                const list = Array.isArray(res.data) ? res.data : []
                setPendingRides(list)
                if (!ridePopupOpenRef.current && !confirmRideOpenRef.current && list.length > 0) {
                    setRide(list[0])
                    setRidePopupPanel(true)
                }
            })
            .catch(() => setPendingRides([]))
        fetchPending()
        const bootFetch = setTimeout(fetchPending, 300)
        socket.on('connect', fetchPending)
        axios.get(`${API_BASE_URL}/driver-subscriptions/my-status`, { headers: { Authorization: `Bearer ${token}` } })
            .then((res) => setSubscriptionStatus(res.data))
            .catch(() => setSubscriptionStatus({ active: false }))
        let locationEmitTimer
        let locationWatchId
        if (navigator.geolocation) {
            locationWatchId = navigator.geolocation.watchPosition(
                (position) => {
                    const lat = position.coords.latitude
                    const lng = position.coords.longitude
                    clearTimeout(locationEmitTimer)
                    locationEmitTimer = setTimeout(() => {
                        socket.emit('driver:location-update', {
                            driverId: capId,
                            lat,
                            lng,
                        })
                    }, LOCATION_EMIT_MS)
                },
                () => {},
                { enableHighAccuracy: true, maximumAge: 5000 }
            )
        }

        const pendingInterval = setInterval(fetchPending, PENDING_POLL_MS)

        return () => {
            socket.off('connect', doJoin)
            socket.off('connect', fetchPending)
            clearTimeout(bootFetch)
            clearTimeout(locationEmitTimer)
            if (locationWatchId != null) navigator.geolocation.clearWatch(locationWatchId)
            clearInterval(pendingInterval)
        }
    }, [ captain?._id, captain?.city, captain?.status, socket ])

    useEffect(() => {
        if (!socket) return

        const handleNewRide = (data) => {
            if (captainOnlineRef.current !== true) return
            if (confirmRideOpenRef.current) return
            const r = data?.ride || data
            if (!r || !(r._id || r.id)) return
            const st = String(r.status || 'searching').trim().toLowerCase()
            if (st !== 'searching') return
            const cap = r.captain
            if (cap && (cap._id || (typeof cap === 'string' && cap.length > 0))) return
            setRide(r)
            setRidePopupPanel(true)
        }

        const handleRideCompletedSocket = (payload) => {
            const rid = payload?.rideId != null ? String(payload.rideId) : ''
            const current = activeRideIdRef.current || ''
            if (rid && current && rid === current) {
                setConfirmRidePopupPanel(false)
                setRidePopupPanel(false)
                setRide(null)
            }
        }

        const handlePassengerGps = (payload) => {
            if (payload?.source !== 'passenger') return
            const rid = payload?.rideId != null ? String(payload.rideId) : ''
            const current = activeRideIdRef.current || ''
            if (!rid || !current || rid !== current) return
            if (payload?.lat == null || payload?.lng == null) return
            setPassengerLiveCoords({ lat: Number(payload.lat), lng: Number(payload.lng) })
        }

        const handleCatchUpStatus = (data) => {
            if (!data?.catchUp || !data?.ride) return
            const st = String(data.status || '').toLowerCase()
            if (st !== 'accepted' && st !== 'arrived') return
            setRide(data.ride)
            setRidePopupPanel(false)
            setConfirmRidePopupPanel(true)
        }

        socket.on(RIDE_REQUEST, handleNewRide)
        socket.on(RIDE_COMPLETED, handleRideCompletedSocket)
        socket.on(LOCATION_UPDATE, handlePassengerGps)
        socket.on('ride:status-update', handleCatchUpStatus)

        return () => {
            socket.off(RIDE_REQUEST, handleNewRide)
            socket.off(RIDE_COMPLETED, handleRideCompletedSocket)
            socket.off(LOCATION_UPDATE, handlePassengerGps)
            socket.off('ride:status-update', handleCatchUpStatus)
        }
    }, [ socket, captain?.status ])

    useEffect(() => {
        captainOnlineRef.current = captain?.status === 'active'
    }, [ captain?.status ])

    async function confirmRide() {
        if (!ride?._id) return
        try {
            const res = await axios.patch(`${API_BASE_URL}/rides/${ride._id}/accept`, {}, {
                headers: { Authorization: `Bearer ${getCaptainToken()}` }
            })
            setRide(stripApiEnvelope(res.data))
            setRidePopupPanel(false)
            setConfirmRidePopupPanel(true)
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to accept ride.')
            setRidePopupPanel(false)
        }
    }

    async function rejectRide() {
        if (!ride?._id) return
        try {
            await axios.patch(`${API_BASE_URL}/rides/${ride._id}/reject`, {}, {
                headers: { Authorization: `Bearer ${getCaptainToken()}` }
            })
            setRidePopupPanel(false)
            setRide(null)
        } catch (err) {
            alert(err.response?.data?.message || 'Reject failed')
        }
    }


    useGSAP(function () {
        if (ridePopupPanel) {
            gsap.to(ridePopupPanelRef.current, {
                transform: 'translateY(0)'
            })
        } else {
            gsap.to(ridePopupPanelRef.current, {
                transform: 'translateY(100%)'
            })
        }
    }, [ ridePopupPanel ])

    useGSAP(function () {
        if (confirmRidePopupPanel) {
            gsap.to(confirmRidePopupPanelRef.current, {
                transform: 'translateY(0)'
            })
        } else {
            gsap.to(confirmRidePopupPanelRef.current, {
                transform: 'translateY(100%)'
            })
        }
    }, [ confirmRidePopupPanel ])

    return (
        <div className="min-h-[100dvh] flex flex-col bg-slate-900 text-slate-100">
            <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6 border-b border-slate-800">
                <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Driver</p>
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-lg font-semibold text-white sm:text-xl">Dashboard</h1>
                        {captain?.status === 'active' ? (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                                Online
                            </span>
                        ) : (
                            <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                Offline
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <Link
                        to="/captain/history"
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700"
                        aria-label="Trip history"
                    >
                        <i className="text-lg ri-history-line" />
                    </Link>
                    <Link
                        to="/captain/logout"
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700"
                        aria-label="Logout"
                    >
                        <i className="text-lg ri-logout-box-r-line" />
                    </Link>
                </div>
            </header>

            {/* Live map — no external brand GIF / logo */}
            <div className="min-h-[36vh] flex-1 w-full sm:min-h-[42vh] md:min-h-[48vh]">
                {ride && rideMapCoords.pickup ? (
                    <RideMap
                        pickupCoords={rideMapCoords.pickup}
                        dropCoords={rideMapCoords.drop}
                        driverCoords={captainGps}
                        passengerLiveCoords={passengerLiveCoords}
                        showRoute={!!rideMapCoords.drop}
                        trackingFrom={captainGps && rideMapCoords.pickup ? captainGps : null}
                        trackingTo={captainGps && rideMapCoords.pickup ? rideMapCoords.pickup : null}
                    />
                ) : (
                    <LiveTracking />
                )}
            </div>

            <section className="shrink-0 rounded-t-2xl bg-white text-slate-900 shadow-[0_-12px_40px_rgba(0,0,0,0.2)] px-4 py-4 sm:px-6 max-h-[min(52vh,520px)] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
                <CaptainDetails />
                {subscriptionStatus && !subscriptionStatus.active && (
                    <p className="text-amber-600 text-sm mt-3">Activate subscription to receive ride requests.</p>
                )}
            </section>

            <div ref={ridePopupPanelRef} className='fixed w-full z-[100] bottom-0 translate-y-full bg-white text-slate-900 px-3 py-10 pt-12 shadow-[0_-8px_30px_rgba(0,0,0,0.15)] max-h-[85vh] overflow-y-auto'>
                <RidePopUp
                    ride={ride}
                    setRidePopupPanel={setRidePopupPanel}
                    confirmRide={confirmRide}
                    onReject={rejectRide}
                />
            </div>
            <div ref={confirmRidePopupPanelRef} className='fixed w-full h-screen z-[100] bottom-0 translate-y-full bg-white text-slate-900 px-3 py-10 pt-12'>
                <ConfirmRidePopUp
                    ride={ride}
                    setConfirmRidePopupPanel={setConfirmRidePopupPanel} setRidePopupPanel={setRidePopupPanel} />
            </div>
        </div>
    )
}

export default CaptainHome
