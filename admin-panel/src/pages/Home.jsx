import React, { useEffect, useRef, useState, useContext, useCallback } from 'react'
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import 'remixicon/fonts/remixicon.css'
import { apiClient, withAuth } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { stripApiEnvelope } from '../utils/apiBody'
import { RIDE_ACCEPTED, RIDE_STARTED, RIDE_COMPLETED, LOCATION_UPDATE } from '../constants/rideSocketEvents'
import LocationSearchPanel from '../components/LocationSearchPanel';
import VehiclePanel from '../components/VehiclePanel';
import ConfirmRide from '../components/ConfirmRide';
import LookingForDriver from '../components/LookingForDriver';
import WaitingForDriver from '../components/WaitingForDriver';
import { SocketContext } from '../context/SocketContext';
import { UserDataContext } from '../context/UserContext';
import { useNavigate, useLocation } from 'react-router-dom';
import LiveTracking from '../components/LiveTracking';
import RideMap from '../components/RideMap';
import { getAppLogoUrl } from '../config/externalEndpoints';
const USER_RIDE_SESSION_KEY = 'rideeasy_user_ride'

/** Normalize OTP from any API response shape (`data` is the JSON body). */
function otpFromPassengerOtpResponse(res) {
    const d = res?.data
    if (!d || typeof d !== 'object') return ''
    const o = d.otp ?? d.confirmation?.otp ?? d.data?.otp ?? d.payload?.otp
    if (o == null || o === '') return ''
    return String(o).trim()
}

/** Split `confirmation` DTO from ride GET/accept payloads so `ride` state stays a plain ride doc. */
function splitRideApiPayload(raw) {
    const o = stripApiEnvelope(raw)
    const conf = o.confirmation && typeof o.confirmation === 'object' ? { ...o.confirmation } : null
    const rest = { ...o }
    delete rest.confirmation
    return { ride: rest, confirmation: conf }
}

function normalizeRideStatus(s) {
    return String(s || '').trim().toLowerCase()
}

const Home = () => {
    const location = useLocation()
    const [ pickup, setPickup ] = useState(location?.state?.pickup || '')
    const [ destination, setDestination ] = useState(location?.state?.drop || location?.state?.destination || '')
    const [ panelOpen, setPanelOpen ] = useState(false)
    const vehiclePanelRef = useRef(null)
    const confirmRidePanelRef = useRef(null)
    const vehicleFoundRef = useRef(null)
    const waitingForDriverRef = useRef(null)
    const panelRef = useRef(null)
    const panelCloseRef = useRef(null)
    const [ vehiclePanel, setVehiclePanel ] = useState(false)
    const [ confirmRidePanel, setConfirmRidePanel ] = useState(false)
    const [ vehicleFound, setVehicleFound ] = useState(false)
    const [ waitingForDriver, setWaitingForDriver ] = useState(false)
    const [ pickupSuggestions, setPickupSuggestions ] = useState([])
    const [ destinationSuggestions, setDestinationSuggestions ] = useState([])
    const [ activeField, setActiveField ] = useState(null)
    const [ fare, setFare ] = useState({})
    const [ vehicleType, setVehicleType ] = useState(null)
    const [ ride, setRide ] = useState(null)
    const [ hasShownAcceptAlert, setHasShownAcceptAlert ] = useState(false)
    const [ pickupCoords, setPickupCoords ] = useState(null)
    const [ dropCoords, setDropCoords ] = useState(null)
    const [ driverCoords, setDriverCoords ] = useState(null)
    const [ passengerCoords, setPassengerCoords ] = useState(null)
    const [ passengerOtp, setPassengerOtp ] = useState('')
    const [ rideConfirmation, setRideConfirmation ] = useState(null)
    const [ bookingError, setBookingError ] = useState('')
    const passengerOtpRef = useRef('')
    passengerOtpRef.current = passengerOtp
    const rideRef = useRef(null)
    rideRef.current = ride
    const socketOtpSyncTimer = useRef(null)

    const navigate = useNavigate()

    /** Single source of truth: GET ride (includes otp + captain location) then fallback passenger-otp. */
    const syncRideFromServer = useCallback((rideId) => {
        const token = localStorage.getItem('token')
        if (rideId == null || rideId === '' || !token) return Promise.resolve()
        const id = String(rideId)
        const applyCaptainCoords = (data) => {
            const loc = data?.captain?.location
            if (loc?.coordinates?.length === 2) {
                setDriverCoords({ lat: loc.coordinates[1], lng: loc.coordinates[0] })
            }
        }
        return apiClient
            .get(`/rides/${id}`, withAuth())
            .then((res) => {
                const { ride: data, confirmation: conf } = splitRideApiPayload(res.data)
                setRide(data)
                if (conf) setRideConfirmation(conf)
                applyCaptainCoords(data)
                if (conf?.liveLocation?.lat != null && conf?.liveLocation?.lng != null) {
                    setDriverCoords({ lat: conf.liveLocation.lat, lng: conf.liveLocation.lng })
                }
                if (data?.otp) {
                    setPassengerOtp(String(data.otp).trim())
                    return data
                }
                const st = normalizeRideStatus(data?.status)
                if (st === 'accepted' || st === 'arrived') {
                    return apiClient
                        .get(`/rides/${id}/passenger-otp`, withAuth())
                        .then((r) => {
                            const o = otpFromPassengerOtpResponse(r)
                            if (o) setPassengerOtp(o)
                            if (r?.data?.confirmation) {
                                setRideConfirmation((prev) => ({ ...(prev || {}), ...r.data.confirmation }))
                            }
                            return data
                        })
                }
                return data
            })
            .catch(() => undefined)
    }, [])

    const { socket } = useContext(SocketContext)
    const userContextValue = useContext(UserDataContext)
    const currentUser = userContextValue?.user ?? null
    const activeCity = currentUser?.city || location?.state?.city || 'Pune'

    useEffect(() => {
        if (!socket || !currentUser?._id) return;
        const uid = String(currentUser._id);
        const emitJoin = () => {
            socket.emit('join', { userType: 'user', userId: uid });
        };
        emitJoin();
        socket.on('connect', emitJoin);
        return () => {
            socket.off('connect', emitJoin);
        };
    }, [socket, currentUser?._id]);

    /** Passenger GPS → map + Socket.IO for driver app (server forwards to assigned captain). */
    useEffect(() => {
        const st = normalizeRideStatus(ride?.status)
        const activeRide =
            vehicleFound
            || waitingForDriver
            || (ride && [ 'searching', 'accepted', 'arrived', 'started' ].includes(st))
        if (!socket || !currentUser?._id || !activeRide || !navigator.geolocation) {
            if (!activeRide) setPassengerCoords(null)
            return
        }
        let emitTimer
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = pos.coords.latitude
                const lng = pos.coords.longitude
                setPassengerCoords({ lat, lng })
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
    }, [socket, currentUser?._id, vehicleFound, waitingForDriver, ride])

    /** Restore active booking after refresh (ride id in sessionStorage). */
    useEffect(() => {
        if (ride?._id) return
        const id = sessionStorage.getItem(USER_RIDE_SESSION_KEY)
        if (!id || !currentUser?._id) return
        const token = localStorage.getItem('token')
        if (!token) return
        syncRideFromServer(id).then((data) => {
            if (!data) {
                try { sessionStorage.removeItem(USER_RIDE_SESSION_KEY) } catch { /* ignore */ }
                return
            }
            const st = normalizeRideStatus(data.status)
            if (![ 'searching', 'accepted', 'arrived' ].includes(st)) {
                try { sessionStorage.removeItem(USER_RIDE_SESSION_KEY) } catch { /* ignore */ }
                return
            }
            if (st === 'searching') {
                setVehicleFound(true)
                setWaitingForDriver(false)
            } else {
                setVehicleFound(false)
                setWaitingForDriver(true)
            }
        })
    }, [ride, currentUser?._id, syncRideFromServer])

    useEffect(() => {
        if (!socket) return;

        const handleRideAccepted = (payload) => {
            setVehicleFound(false);
            setWaitingForDriver(true);
            const rideDoc = payload?.ride != null ? payload.ride : (payload?._id ? payload : null)
            if (!rideDoc) return
            setRide(rideDoc);
            if (payload?.confirmation) {
                setRideConfirmation(payload.confirmation)
            }
            const otpVal = payload?.confirmation?.otp ?? payload?.otp
            if (otpVal != null && String(otpVal).trim() !== '') {
                setPassengerOtp(String(otpVal).trim())
            }
            const locFromConf = payload?.confirmation?.liveLocation
            if (locFromConf?.lat != null && locFromConf?.lng != null) {
                setDriverCoords({ lat: locFromConf.lat, lng: locFromConf.lng })
            } else {
                const loc = rideDoc?.captain?.location
                if (loc?.coordinates?.length === 2) {
                    setDriverCoords({ lng: loc.coordinates[0], lat: loc.coordinates[1] })
                }
            }
            const rid = rideDoc?._id
            if (rid) {
                try {
                    sessionStorage.setItem(USER_RIDE_SESSION_KEY, String(rid))
                } catch { /* ignore */ }
                syncRideFromServer(rid)
            }
            if (!hasShownAcceptAlert) {
                setHasShownAcceptAlert(true)
                alert("Driver has accepted your ride")
            }
        };

        const handleStatusUpdate = (data) => {
            if (!data) return
            const rid = rideRef.current?._id
            const incomingRid = data?.rideId != null ? String(data.rideId) : ''
            const currentRid = rid != null ? String(rid) : ''
            if (incomingRid && currentRid && incomingRid !== currentRid) return
            if (data?.status) {
                if (data.confirmation) {
                    setRideConfirmation((prev) => ({ ...(prev || {}), ...data.confirmation }))
                }
                setRide((prev) => {
                    const base = { ...(prev || {}) }
                    if (data.ride) return { ...base, ...data.ride, status: data.status }
                    return { ...base, status: data.status }
                })
                const st = data.status
                if (st === 'started' || st === 'completed') {
                    try {
                        sessionStorage.removeItem(USER_RIDE_SESSION_KEY)
                    } catch { /* ignore */ }
                }
                /* Always re-fetch ride+OTP on accepted/arrived — location pings include driverLocation and previously skipped OTP sync */
                if (st === 'accepted' || st === 'arrived') {
                    const otpRid = incomingRid || currentRid
                    if (otpRid) {
                        if (socketOtpSyncTimer.current) clearTimeout(socketOtpSyncTimer.current)
                        socketOtpSyncTimer.current = setTimeout(() => {
                            socketOtpSyncTimer.current = null
                            syncRideFromServer(otpRid)
                        }, passengerOtpRef.current ? 400 : 0)
                    }
                }
                if (st === 'searching') {
                    setVehicleFound(true)
                    setWaitingForDriver(false)
                    const sid = incomingRid || (data.ride?._id != null ? String(data.ride._id) : '')
                    if (sid) {
                        try {
                            sessionStorage.setItem(USER_RIDE_SESSION_KEY, sid)
                        } catch { /* ignore */ }
                    }
                }
                if (st === 'accepted') {
                    setVehicleFound(false)
                    setWaitingForDriver(true)
                }
                if (st === 'arrived') setWaitingForDriver(true)
                if (st === 'started') {
                    setWaitingForDriver(false)
                    const r = data.ride || rideRef.current
                    navigate('/riding', { state: { ride: { ...(r || {}), status: 'started' } } })
                }
                if (st === 'completed') {
                    setWaitingForDriver(false)
                    setVehicleFound(false)
                    setRideConfirmation(null)
                }
            }
            if (data?.driverLocation?.lat != null && data?.driverLocation?.lng != null) {
                setDriverCoords({ lat: data.driverLocation.lat, lng: data.driverLocation.lng })
            }
        }

        const handleLocationUpdate = (payload) => {
            if (!payload) return
            if (payload.source === 'passenger') return
            const incomingRid = payload?.rideId != null ? String(payload.rideId) : ''
            const currentRid = rideRef.current?._id != null ? String(rideRef.current._id) : ''
            if (incomingRid && currentRid && incomingRid !== currentRid) return
            if (payload.lat != null && payload.lng != null) {
                setDriverCoords({ lat: Number(payload.lat), lng: Number(payload.lng) })
                setRideConfirmation((prev) => {
                    if (!prev) {
                        return {
                            liveLocation: { lat: Number(payload.lat), lng: Number(payload.lng) },
                        }
                    }
                    return {
                        ...prev,
                        liveLocation: { lat: Number(payload.lat), lng: Number(payload.lng) },
                    }
                })
            }
        }

        socket.on(RIDE_ACCEPTED, handleRideAccepted)
        socket.on(LOCATION_UPDATE, handleLocationUpdate)
        const handleRideStarted = (payload) => {
            if (payload?.confirmation) {
                setRideConfirmation((prev) => ({ ...(prev || {}), ...payload.confirmation }))
            }
            handleStatusUpdate({
                rideId: payload?.rideId,
                status: 'started',
                ride: payload?.ride,
                confirmation: payload?.confirmation,
            })
        }
        const handleRideCompletedEvt = (payload) => {
            handleStatusUpdate({
                rideId: payload?.rideId,
                status: 'completed',
                ride: payload?.ride,
            })
        }
        socket.on(RIDE_STARTED, handleRideStarted)
        socket.on(RIDE_COMPLETED, handleRideCompletedEvt)
        socket.on('ride:status-update', handleStatusUpdate)

        return () => {
            socket.off(RIDE_ACCEPTED, handleRideAccepted)
            socket.off(LOCATION_UPDATE, handleLocationUpdate)
            socket.off(RIDE_STARTED, handleRideStarted)
            socket.off(RIDE_COMPLETED, handleRideCompletedEvt)
            socket.off('ride:status-update', handleStatusUpdate)
        }
    }, [socket, navigate, hasShownAcceptAlert, syncRideFromServer]);

    const fetchPassengerOtp = useCallback(() => {
        if (!ride?._id) return
        const st = normalizeRideStatus(ride.status)
        if (st !== 'accepted' && st !== 'arrived') return
        syncRideFromServer(ride._id)
    }, [ride?._id, ride?.status, syncRideFromServer])

    useEffect(() => {
        fetchPassengerOtp()
    }, [fetchPassengerOtp])

    useEffect(() => {
        if (!ride?._id) return
        const st = normalizeRideStatus(ride.status)
        if (st !== 'accepted' && st !== 'arrived') return
        const t1 = setTimeout(fetchPassengerOtp, 200)
        const t2 = setTimeout(fetchPassengerOtp, 1500)
        return () => {
            clearTimeout(t1)
            clearTimeout(t2)
        }
    }, [ride?._id, ride?.status, fetchPassengerOtp])

    /** After accept: poll ride + OTP + captain GPS */
    useEffect(() => {
        if (!ride?._id) return
        const st = normalizeRideStatus(ride.status)
        if (st !== 'accepted' && st !== 'arrived') return
        const tick = () => {
            syncRideFromServer(ride._id)
        }
        tick()
        const id = setInterval(tick, 5000)
        return () => clearInterval(id)
    }, [ride?._id, ride?.status, syncRideFromServer]);

    /** Poll searching ride; deps are primitives only — depending on the `ride`
        object re-ran this effect on every setRide and hammered the API. */
    useEffect(() => {
        if (!ride?._id) return
        if (ride?.status && ride.status !== 'searching') return

        let cancelled = false

        const poll = async () => {
            try {
                if (ride?.status === 'searching' && (!ride?.captain?._id && !ride?.captain)) {
                    await apiClient.post(`/rides/${ride._id}/retry-assign`, {}, withAuth()).catch(() => {})
                }
                const res = await apiClient.get(`/rides/${ride._id}`, withAuth())
                if (cancelled) return

                const { ride: data, confirmation: conf } = splitRideApiPayload(res.data)
                setRide(data)
                if (conf) setRideConfirmation(conf)
                if (conf?.liveLocation?.lat != null && conf?.liveLocation?.lng != null) {
                    setDriverCoords({ lat: conf.liveLocation.lat, lng: conf.liveLocation.lng })
                }
                if (data?.otp) setPassengerOtp(String(data.otp).trim())

                const dst = normalizeRideStatus(data?.status)
                if (data?._id && (dst === 'accepted' || dst === 'arrived')) {
                    syncRideFromServer(data._id)
                }

                if (data?.status === 'accepted') {
                    setVehicleFound(false)
                    setWaitingForDriver(true)
                    syncRideFromServer(data._id)
                    if (!hasShownAcceptAlert) {
                        setHasShownAcceptAlert(true)
                        alert("Driver has accepted your ride")
                    }
                }
            } catch {
                // ignore transient polling errors
            }
        }

        poll()
        const id = setInterval(poll, 5000)
        return () => {
            cancelled = true
            clearInterval(id)
        }
    }, [ride?._id, ride?.status, hasShownAcceptAlert, syncRideFromServer]);


    const handlePickupChange = async (e) => {
        const value = e.target.value
        setPickup(value)
        const trimmed = value.trim()
        if (!trimmed) {
            setPickupSuggestions([])
            return
        }
        try {
            const response = await apiClient.get('/maps/get-suggestions', withAuth({
                params: { input: trimmed },
            }))
            setPickupSuggestions(response.data)
        } catch {
            setPickupSuggestions([])
        }
    }

    const handleDestinationChange = async (e) => {
        const value = e.target.value
        setDestination(value)
        const trimmed = value.trim()
        if (!trimmed) {
            setDestinationSuggestions([])
            return
        }
        try {
            const response = await apiClient.get('/maps/get-suggestions', withAuth({
                params: { input: trimmed },
            }))
            setDestinationSuggestions(response.data)
        } catch {
            setDestinationSuggestions([])
        }
    }

    const fetchPickupCoords = async (address) => {
        if (!address?.trim()) return
        try {
            const res = await apiClient.get('/maps/get-coordinates', withAuth({
                params: { address: address.trim() },
            }))
            if (res.data?.lat != null && res.data?.lng != null) {
                setPickupCoords({ lat: res.data.lat, lng: res.data.lng })
            }
        } catch {
            setPickupCoords(null)
        }
    }

    const fetchDropCoords = async (address) => {
        if (!address?.trim()) return
        try {
            const res = await apiClient.get('/maps/get-coordinates', withAuth({
                params: { address: address.trim() },
            }))
            if (res.data?.lat != null && res.data?.lng != null) {
                setDropCoords({ lat: res.data.lat, lng: res.data.lng })
            }
        } catch {
            setDropCoords(null)
        }
    }

    const handleSelectPickup = (suggestion) => {
        const name = typeof suggestion === 'string' ? suggestion : suggestion?.name
        if (!name) return
        if (typeof suggestion === 'object' && suggestion?.lat != null && suggestion?.lng != null) {
            setPickupCoords({ lat: suggestion.lat, lng: suggestion.lng })
        } else {
            fetchPickupCoords(name)
        }
    }

    const handleSelectDestination = (suggestion) => {
        const name = typeof suggestion === 'string' ? suggestion : suggestion?.name
        if (!name) return
        if (typeof suggestion === 'object' && suggestion?.lat != null && suggestion?.lng != null) {
            setDropCoords({ lat: suggestion.lat, lng: suggestion.lng })
        } else {
            fetchDropCoords(name)
        }
    }

    const submitHandler = (e) => {
        e.preventDefault()
    }

    useGSAP(function () {
        const panel = panelRef.current
        if (!panel) return
        if (panelOpen) {
            gsap.to(panel, {
                height: '70%',
                padding: 24
            })
            const closeEl = panelCloseRef.current
            if (closeEl) gsap.to(closeEl, { opacity: 1 })
        } else {
            gsap.to(panel, {
                height: '0%',
                padding: 0
            })
            const closeEl = panelCloseRef.current
            if (closeEl) gsap.to(closeEl, { opacity: 0 })
        }
    }, [ panelOpen ])


    useGSAP(function () {
        const el = vehiclePanelRef.current
        if (!el) return
        gsap.to(el, { transform: vehiclePanel ? 'translateY(0)' : 'translateY(100%)' })
    }, [ vehiclePanel ])

    useGSAP(function () {
        const el = confirmRidePanelRef.current
        if (!el) return
        gsap.to(el, { transform: confirmRidePanel ? 'translateY(0)' : 'translateY(100%)' })
    }, [ confirmRidePanel ])

    useGSAP(function () {
        const el = vehicleFoundRef.current
        if (!el) return
        gsap.to(el, { transform: vehicleFound ? 'translateY(0)' : 'translateY(100%)' })
    }, [ vehicleFound ])

    useGSAP(function () {
        const el = waitingForDriverRef.current
        if (!el) return
        gsap.to(el, { transform: waitingForDriver ? 'translateY(0)' : 'translateY(100%)' })
    }, [ waitingForDriver ])


    async function findTrip() {
        const p = (pickup || '').trim()
        const d = (destination || '').trim()
        if (!p || !d) {
            alert('Please enter pickup and drop location to get fare.')
            return
        }
        setVehiclePanel(true)
        setPanelOpen(false)
        setBookingError('')
        try {
            const response = await apiClient.get('/rides/get-fare', withAuth({
                params: { pickup: p, destination: d },
            }))
            setFare(stripApiEnvelope(response.data))
            fetchPickupCoords(p)
            fetchDropCoords(d)
        } catch (err) {
            setBookingError(formatApiError(err))
            setVehiclePanel(false)
        }
    }

    async function createRide(opts = {}) {
        const { paymentMethod = 'Cash' } = opts
        const u = String(vehicleType || 'AUTO').toUpperCase()
        const vehicleTypeNorm = u === 'MINI' || u === 'SEDAN' ? 'CAR' : ([ 'BIKE', 'AUTO', 'CAR' ].includes(u) ? u : 'AUTO')
        const price = fare[vehicleTypeNorm] ?? fare[vehicleType]
        if (price == null) {
            alert('Please select pickup, drop and vehicle type again.')
            return
        }
        try {
            setBookingError('')
            setRideConfirmation(null)
            setVehicleFound(true)
            setVehiclePanel(false)
            setConfirmRidePanel(false)
            const response = await apiClient.post('/rides/create', {
                pickupLocation: pickup,
                dropLocation: destination,
                city: activeCity,
                vehicleType: vehicleTypeNorm,
                paymentMethod: paymentMethod || 'Cash',
                price,
                distanceKm: fare.distanceKm
            }, withAuth())
            const raw = stripApiEnvelope(response.data)
            const ridePayload = { ...raw }
            delete ridePayload.otp
            setRide(ridePayload)
            setPassengerOtp('')
            setDriverCoords(null)
            setHasShownAcceptAlert(false)
            if (ridePayload?._id) {
                try {
                    sessionStorage.setItem(USER_RIDE_SESSION_KEY, String(ridePayload._id))
                } catch { /* ignore */ }
            }
            return ridePayload
        } catch (err) {
            setVehicleFound(false)
            setBookingError(formatApiError(err))
            return null
        }
    }

    const handleVehicleTap = (type) => {
        setVehicleType(type)
    }

    const continueFromVehiclePanel = () => {
        if (!vehicleType) {
            alert('Please choose a ride')
            return
        }
        setVehiclePanel(false)
        setConfirmRidePanel(true)
    }

    const showSearchPanel = !(vehiclePanel || confirmRidePanel || vehicleFound || waitingForDriver)

    const trackingDriverToPickup =
        waitingForDriver
        && driverCoords?.lat != null
        && pickupCoords?.lat != null

    return (
        <div className='h-screen relative overflow-hidden'>
            <div className="absolute z-20 top-4 left-0 right-0 flex justify-center pointer-events-none">
                <img
                    className="w-16"
                    src={getAppLogoUrl()}
                    alt="RideEasy"
                />
            </div>
            <div className='h-screen w-screen relative z-0'>
                {(pickupCoords || dropCoords) ? (
                    <RideMap
                        pickupCoords={pickupCoords}
                        dropCoords={dropCoords}
                        driverCoords={driverCoords}
                        passengerLiveCoords={passengerCoords}
                        showRoute={!!(pickupCoords && dropCoords)}
                        trackingFrom={trackingDriverToPickup ? driverCoords : null}
                        trackingTo={trackingDriverToPickup ? pickupCoords : null}
                    />
                ) : (
                    <LiveTracking />
                )}
            </div>
            <div className='z-20 flex flex-col justify-end h-screen absolute top-0 w-full'>
                {showSearchPanel && (
                    <div className='h-[30%] p-6 bg-white text-slate-900 relative'>
                    <h5 ref={panelCloseRef} onClick={() => {
                        setPanelOpen(false)
                    }} className='absolute opacity-0 right-6 top-6 text-2xl'>
                        <i className="ri-arrow-down-wide-line"></i>
                    </h5>
                    <h4 className='text-2xl font-semibold'>Find a trip</h4>
                    {bookingError ? (
                        <div
                            role="alert"
                            className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 whitespace-pre-line"
                        >
                            {bookingError}
                        </div>
                    ) : null}
                    <form className='relative py-3' onSubmit={(e) => {
                        submitHandler(e)
                    }}>
                        <div className="line absolute h-16 w-1 top-[50%] -translate-y-1/2 left-5 bg-gray-700 rounded-full"></div>
                        <input
                            onClick={() => {
                                setPanelOpen(true)
                                setActiveField('pickup')
                            }}
                            value={pickup}
                            onChange={handlePickupChange}
                            className='bg-[#eee] px-12 py-2 text-lg rounded-lg w-full'
                            type="text"
                            placeholder='Add a pick-up location'
                        />
                        <input
                            onClick={() => {
                                setPanelOpen(true)
                                setActiveField('destination')
                            }}
                            value={destination}
                            onChange={handleDestinationChange}
                            className='bg-[#eee] px-12 py-2 text-lg rounded-lg w-full  mt-3'
                            type="text"
                            placeholder='Enter your destination' />
                        {(currentUser?.savedAddresses?.home || currentUser?.savedAddresses?.work) && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {currentUser.savedAddresses?.home ? (
                                    <button
                                        type="button"
                                        className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                                        onClick={() => {
                                            const a = currentUser.savedAddresses.home
                                            setPickup(a)
                                            fetchPickupCoords(a)
                                        }}
                                    >
                                        Home → pickup
                                    </button>
                                ) : null}
                                {currentUser.savedAddresses?.work ? (
                                    <button
                                        type="button"
                                        className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                                        onClick={() => {
                                            const a = currentUser.savedAddresses.work
                                            setDestination(a)
                                            fetchDropCoords(a)
                                        }}
                                    >
                                        Work → drop
                                    </button>
                                ) : null}
                                {currentUser.savedAddresses?.home ? (
                                    <button
                                        type="button"
                                        className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                                        onClick={() => {
                                            const a = currentUser.savedAddresses.home
                                            setDestination(a)
                                            fetchDropCoords(a)
                                        }}
                                    >
                                        Home → drop
                                    </button>
                                ) : null}
                                {currentUser.savedAddresses?.work ? (
                                    <button
                                        type="button"
                                        className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                                        onClick={() => {
                                            const a = currentUser.savedAddresses.work
                                            setPickup(a)
                                            fetchPickupCoords(a)
                                        }}
                                    >
                                        Work → pickup
                                    </button>
                                ) : null}
                            </div>
                        )}
                    </form>
                    <button
                        onClick={findTrip}
                        className='bg-black text-white px-4 py-2 rounded-lg mt-3 w-full'>
                        Find Trip
                    </button>
                </div>
                )}
                <div
                    ref={panelRef}
                    className={`bg-white text-slate-900 h-0 ${showSearchPanel ? '' : 'hidden'}`}
                >
                    <LocationSearchPanel
                        suggestions={activeField === 'pickup' ? pickupSuggestions : destinationSuggestions}
                        setPickup={setPickup}
                        setDestination={setDestination}
                        activeField={activeField}
                        onSelectPickup={handleSelectPickup}
                        onSelectDestination={handleSelectDestination}
                    />
                </div>
            </div>
            <div ref={vehiclePanelRef} className='fixed w-full z-50 bottom-0 translate-y-full bg-white text-slate-900 px-3 py-10 pt-12 pb-24'>
                <VehiclePanel
                    selectedVehicle={vehicleType}
                    onSelectVehicle={handleVehicleTap}
                    onContinue={continueFromVehiclePanel}
                    city={activeCity}
                    fare={fare} setConfirmRidePanel={setConfirmRidePanel} setVehiclePanel={setVehiclePanel} />
            </div>
            <div ref={confirmRidePanelRef} className='fixed w-full z-50 bottom-0 translate-y-full bg-white text-slate-900 px-3 py-6 pt-12 pb-24'>
                <ConfirmRide
                    createRide={createRide}
                    pickup={pickup}
                    destination={destination}
                    fare={fare}
                    vehicleType={vehicleType}

                    setConfirmRidePanel={setConfirmRidePanel} setVehicleFound={setVehicleFound} />
            </div>
            <div ref={vehicleFoundRef} className='fixed w-full z-50 bottom-0 translate-y-full bg-white text-slate-900 px-3 py-6 pt-12 pb-24'>
                <LookingForDriver
                    createRide={createRide}
                    pickup={pickup}
                    destination={destination}
                    fare={fare}
                    vehicleType={vehicleType}
                    ride={ride}
                    passengerOtp={passengerOtp}
                    setVehicleFound={setVehicleFound} />
            </div>
            <div ref={waitingForDriverRef} className='fixed w-full  z-50 bottom-0  bg-white text-slate-900 px-3 py-6 pt-12 pb-24'>
                <WaitingForDriver
                    ride={ride}
                    confirmation={rideConfirmation}
                    passengerOtp={passengerOtp}
                    driverCoords={driverCoords}
                    pickupCoords={pickupCoords}
                    setVehicleFound={setVehicleFound}
                    setWaitingForDriver={setWaitingForDriver}
                    waitingForDriver={waitingForDriver} />
            </div>
        </div>
    )
}

export default Home