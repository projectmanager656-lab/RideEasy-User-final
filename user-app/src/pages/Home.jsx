import React, { useEffect, useRef, useState, useContext, useCallback } from 'react'
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
import { useSocket } from '../hooks/useSocket';
import { UserDataContext } from '../context/UserContext';
import { useNavigate } from 'react-router-dom';
import LiveTracking from '../components/LiveTracking';
import RideMap from '../components/RideMap';
import { getAppLogoUrl } from '../config/externalEndpoints'
import { SERVICE_AREA_USER_MESSAGE, SERVICE_AREAS } from '../utils/serviceArea'
const USER_RIDE_SESSION_KEY = 'rideeasy_user_ride'

const SERVICE_CITY_KEYS = SERVICE_AREAS.map((z) => z.key)

function readStoredServiceCity () {
    try {
        const v = localStorage.getItem('rideeasy_user_service_city')
        if (v && SERVICE_CITY_KEYS.includes(v)) return v
    } catch { /* ignore */ }
    return 'Kolhapur'
}

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
    const [ pickup, setPickup ] = useState('')
    const [ destination, setDestination ] = useState('')
    const [ serviceCity, setServiceCity ] = useState(readStoredServiceCity)
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
    /** Avoid spamming maps geocode when ride polls return the same addresses without GeoJSON. */
    const rideGeocodeOnceRef = useRef({ pick: '', drop: '' })
    /** On app open, keep search form visible until user explicitly resumes/creates a ride. */
    const keepSearchFirstRef = useRef(true)

    const navigate = useNavigate()

    useEffect(() => {
        try {
            localStorage.setItem('rideeasy_user_service_city', serviceCity)
        } catch { /* ignore */ }
    }, [serviceCity])

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

    const socket = useSocket()
    const { user: currentUser } = useContext(UserDataContext)

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
        /** Load ride into state (pickup/drop/OTP) but do NOT auto-open sheets — user stays on “Find a trip”. */
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
            setVehicleFound(false)
            setWaitingForDriver(false)
        })
    }, [ride, currentUser?._id, syncRideFromServer])

    useEffect(() => {
        if (!socket) return;

        const handleRideAccepted = (payload) => {
            if (!keepSearchFirstRef.current) {
                setVehicleFound(false);
                setWaitingForDriver(true);
            }
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
                    if (!keepSearchFirstRef.current) {
                        setVehicleFound(true)
                        setWaitingForDriver(false)
                    }
                    const sid = incomingRid || (data.ride?._id != null ? String(data.ride._id) : '')
                    if (sid) {
                        try {
                            sessionStorage.setItem(USER_RIDE_SESSION_KEY, sid)
                        } catch { /* ignore */ }
                    }
                }
                if (st === 'accepted') {
                    if (!keepSearchFirstRef.current) {
                        setVehicleFound(false)
                        setWaitingForDriver(true)
                    }
                }
                if (st === 'arrived' && !keepSearchFirstRef.current) setWaitingForDriver(true)
                if (st === 'started') {
                    setWaitingForDriver(false)
                    const r = data.ride || rideRef.current
                    navigate('/riding', { state: { ride: { ...(r || {}), status: 'started' } } })
                }
                if (st === 'completed') {
                    setWaitingForDriver(false)
                    setVehicleFound(false)
                    setRideConfirmation(null)
                    setRide(null)
                    setPassengerOtp('')
                    setDriverCoords(null)
                    setPickup('')
                    setDestination('')
                    setPickupCoords(null)
                    setDropCoords(null)
                    setFare({})
                    setVehicleType(null)
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
    }, [ride, hasShownAcceptAlert, syncRideFromServer]);


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
                params: { input: trimmed, city: serviceCity },
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
                params: { input: trimmed, city: serviceCity },
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

    /** Keep pickup/drop text + map pins in sync with the active ride (refresh, socket, or restore). */
    useEffect(() => {
        if (!ride?._id) return
        const st = normalizeRideStatus(ride.status)
        /** Do not pre-fill the home form while “searching” until the user opens the driver-search sheet (avoids stale addresses before From/To entry). */
        const shouldSyncAddressesFromRide =
            vehicleFound
            || waitingForDriver
            || st === 'accepted'
            || st === 'arrived'
        if (!shouldSyncAddressesFromRide) return

        const pu = typeof ride.pickupLocation === 'string' ? ride.pickupLocation.trim() : ''
        const dr = typeof ride.dropLocation === 'string' ? ride.dropLocation.trim() : ''
        /* Keep From/To user-entered only; don't repopulate from previous ride payload. */

        const pc = ride.pickup?.coordinates
        if (Array.isArray(pc) && pc.length === 2) {
            setPickupCoords((prev) => prev || { lat: pc[1], lng: pc[0] })
        } else if (pu) {
            const gk = `${ride._id}:pick:${pu}`
            if (rideGeocodeOnceRef.current.pick !== gk) {
                rideGeocodeOnceRef.current.pick = gk
                fetchPickupCoords(pu)
            }
        }
        const dc = ride.drop?.coordinates
        if (Array.isArray(dc) && dc.length === 2) {
            setDropCoords((prev) => prev || { lat: dc[1], lng: dc[0] })
        } else if (dr) {
            const gk = `${ride._id}:drop:${dr}`
            if (rideGeocodeOnceRef.current.drop !== gk) {
                rideGeocodeOnceRef.current.drop = gk
                fetchDropCoords(dr)
            }
        }

        if (ride.vehicleType && (ride.price != null || ride.fare != null)) {
            const price = ride.price ?? ride.fare
            setFare((prev) => {
                if (prev && typeof prev === 'object' && Object.keys(prev).length > 0) return prev
                const vt = String(ride.vehicleType).toUpperCase()
                return { [vt]: price, price, distanceKm: ride.distance }
            })
            setVehicleType((prev) => prev || ride.vehicleType)
        }
    }, [
        ride?._id,
        ride?.status,
        ride?.pickupLocation,
        ride?.dropLocation,
        ride?.pickup?.coordinates?.[0],
        ride?.pickup?.coordinates?.[1],
        ride?.drop?.coordinates?.[0],
        ride?.drop?.coordinates?.[1],
        ride?.vehicleType,
        ride?.price,
        ride?.fare,
        ride?.distance,
        vehicleFound,
        waitingForDriver,
    ])

    const submitHandler = (e) => {
        e.preventDefault()
    }

    // Replaced GSAP with Tailwind transitions for better reliability.


    async function findTrip() {
        const p = (pickup || '').trim()
        const d = (destination || '').trim()
        if (!p || !d) {
            alert('Please enter pickup and drop location to get fare.')
            return
        }
        setPanelOpen(false)
        setBookingError('')
        try {
            const pickPromise = (pickupCoords?.lat != null && pickupCoords?.lng != null)
                ? Promise.resolve({ data: pickupCoords })
                : apiClient.get('/maps/get-coordinates', withAuth({ params: { address: p } }))
            const dropPromise = (dropCoords?.lat != null && dropCoords?.lng != null)
                ? Promise.resolve({ data: dropCoords })
                : apiClient.get('/maps/get-coordinates', withAuth({ params: { address: d } }))
            const [ pickRes, dropRes ] = await Promise.all([ pickPromise, dropPromise ])
            const pu = pickRes.data?.lat != null && pickRes.data?.lng != null
                ? { lat: pickRes.data.lat, lng: pickRes.data.lng }
                : null
            const du = dropRes.data?.lat != null && dropRes.data?.lng != null
                ? { lat: dropRes.data.lat, lng: dropRes.data.lng }
                : null
            setPickupCoords(pu)
            setDropCoords(du)
            if (!pu || !du) {
                setBookingError('Could not resolve pickup or drop location.')
                return
            }
            const response = await apiClient.get('/rides/get-fare', withAuth({
                params: {
                    pickup: p,
                    destination: d,
                    pickupLat: pu.lat,
                    pickupLng: pu.lng,
                    dropLat: du.lat,
                    dropLng: du.lng,
                },
            }))
            setFare(stripApiEnvelope(response.data))
            setVehiclePanel(true)
        } catch (err) {
            setBookingError(formatApiError(err))
        }
    }

    async function createRide(opts = {}) {
        keepSearchFirstRef.current = false
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
                ...(pickupCoords?.lat != null && pickupCoords?.lng != null
                    ? { pickupLat: pickupCoords.lat, pickupLng: pickupCoords.lng }
                    : {}),
                ...(dropCoords?.lat != null && dropCoords?.lng != null
                    ? { dropLat: dropCoords.lat, dropLng: dropCoords.lng }
                    : {}),
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
        <div className='h-screen relative overflow-hidden w-full max-w-full'>
            <div className="absolute z-20 top-4 left-0 right-0 flex justify-center pointer-events-none">
                <img
                    className="w-16"
                    src={getAppLogoUrl()}
                    alt="RideEasy"
                />
            </div>
            <div className='h-screen w-full relative z-0'>
                {showSearchPanel ? (
                    <div className="h-full w-full bg-black" />
                ) : (pickupCoords || dropCoords) ? (
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
            <div className={`z-20 flex flex-col h-screen absolute top-0 left-0 right-0 mx-auto w-full max-w-lg ${showSearchPanel ? 'justify-center' : 'justify-end'}`}>
                {showSearchPanel && (
                    <div className='max-h-[min(42vh,45%)] shrink-0 overflow-y-auto p-6 rounded-t-3xl border border-zinc-700/80 bg-zinc-950/65 backdrop-blur-md text-zinc-100 relative'>
                    <h5 ref={panelCloseRef} onClick={() => {
                        setPanelOpen(false)
                    }} className={`absolute right-6 top-6 text-2xl transition-opacity duration-300 ${panelOpen ? 'opacity-100' : 'opacity-0'}`}>
                        <i className="ri-arrow-down-wide-line"></i>
                    </h5>
                    <h4 className='text-2xl font-semibold text-white'>Find a trip</h4>
                    <p className="mt-1 text-xs text-slate-500">{SERVICE_AREA_USER_MESSAGE}</p>
                    <div className="mt-3">
                        <label htmlFor="user-service-city" className="mb-1 block text-xs font-medium text-zinc-500">City for search</label>
                        <select
                            id="user-service-city"
                            value={serviceCity}
                            onChange={(e) => setServiceCity(e.target.value)}
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white"
                        >
                            {SERVICE_AREAS.map((z) => (
                                <option key={`${z.key}-${z.name}`} value={z.key}>{z.name}</option>
                            ))}
                        </select>
                    </div>
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
                        <div className="mb-3">
                            <label htmlFor="user-pickup" className="mb-1 block text-xs font-medium text-zinc-500">From</label>
                            <input
                                id="user-pickup"
                                onClick={() => {
                                    setPanelOpen(true)
                                    setActiveField('pickup')
                                }}
                                value={pickup}
                                onChange={handlePickupChange}
                                className='bg-zinc-900 border border-zinc-700 px-4 py-2 text-lg rounded-xl w-full text-white placeholder:text-zinc-500'
                                type="text"
                                autoComplete="off"
                                placeholder='Pick-up address'
                            />
                        </div>
                        <div>
                            <label htmlFor="user-drop" className="mb-1 block text-xs font-medium text-zinc-500">To</label>
                            <input
                                id="user-drop"
                                onClick={() => {
                                    setPanelOpen(true)
                                    setActiveField('destination')
                                }}
                                value={destination}
                                onChange={handleDestinationChange}
                                className='bg-zinc-900 border border-zinc-700 px-4 py-2 text-lg rounded-xl w-full text-white placeholder:text-zinc-500'
                                type="text"
                                autoComplete="off"
                                placeholder='Drop / destination'
                            />
                        </div>
                        {(currentUser?.savedAddresses?.home || currentUser?.savedAddresses?.work) && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {currentUser.savedAddresses?.home ? (
                                    <button
                                        type="button"
                                        className="rounded-full border border-zinc-600 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
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
                                        className="rounded-full border border-zinc-600 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
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
                                        className="rounded-full border border-zinc-600 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
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
                                        className="rounded-full border border-zinc-600 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
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
                        type="button"
                        onClick={findTrip}
                        disabled={
                            !(pickup || '').trim()
                            || !(destination || '').trim()
                        }
                        className='bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-xl mt-3 w-full font-semibold disabled:opacity-50 disabled:cursor-not-allowed'>
                        Find Trip
                    </button>
                </div>
                )}
                <div
                    ref={panelRef}
                    className={`bg-zinc-950 text-zinc-100 overflow-y-auto transition-all duration-300 ease-in-out ${showSearchPanel ? '' : 'hidden'} ${panelOpen ? 'h-[70%] p-6' : 'h-0 p-0'}`}
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
            <div ref={vehiclePanelRef} className={`absolute inset-x-0 w-full z-40 bottom-0 bg-zinc-950 border-t border-zinc-800 text-zinc-100 px-3 pt-10 pb-20 rounded-t-3xl max-h-[90dvh] flex flex-col overflow-hidden shadow-[0_-8px_40px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-in-out ${(vehiclePanel && !confirmRidePanel) ? 'translate-y-0' : 'translate-y-full'}`}>
                <div className="flex min-h-0 flex-1 flex-col">
                    <VehiclePanel
                        selectedVehicle={vehicleType}
                        onSelectVehicle={handleVehicleTap}
                        onContinue={continueFromVehiclePanel}
                        city={String(serviceCity || 'Kolhapur').toLowerCase()}
                        fare={fare} setConfirmRidePanel={setConfirmRidePanel} setVehiclePanel={setVehiclePanel} />
                </div>
            </div>
            <div ref={confirmRidePanelRef} className={`absolute inset-x-0 w-full z-50 bottom-0 bg-zinc-950 border-t border-zinc-800 text-zinc-100 px-3 py-6 pt-12 pb-24 rounded-t-3xl max-h-[92dvh] overflow-y-auto shadow-[0_-8px_40px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-in-out ${confirmRidePanel ? 'translate-y-0' : 'translate-y-full'}`}>
                <ConfirmRide
                    createRide={createRide}
                    pickup={pickup}
                    destination={destination}
                    fare={fare}
                    vehicleType={vehicleType}

                    setConfirmRidePanel={setConfirmRidePanel} setVehicleFound={setVehicleFound} />
            </div>
            <div ref={vehicleFoundRef} className={`absolute inset-x-0 w-full z-50 bottom-0 bg-zinc-950 border-t border-zinc-800 text-zinc-100 px-3 py-6 pt-12 pb-24 rounded-t-3xl transition-transform duration-300 ease-in-out ${vehicleFound ? 'translate-y-0' : 'translate-y-full'}`}>
                <LookingForDriver
                    createRide={createRide}
                    pickup={pickup}
                    destination={destination}
                    fare={fare}
                    vehicleType={vehicleType}
                    ride={ride}
                    passengerOtp={passengerOtp}
                    setVehicleFound={setVehicleFound}
                    onEditLocations={() => {
                        setVehicleFound(false)
                        setPanelOpen(true)
                        setActiveField('pickup')
                    }} />
            </div>
            <div ref={waitingForDriverRef} className={`absolute inset-x-0 w-full z-50 bottom-0 bg-zinc-950 border-t border-zinc-800 text-zinc-100 px-3 py-6 pt-12 pb-24 rounded-t-3xl transition-transform duration-300 ease-in-out ${waitingForDriver ? 'translate-y-0' : 'translate-y-full'}`}>
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
