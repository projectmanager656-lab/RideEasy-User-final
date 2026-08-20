import React, { useEffect, useRef, useState, useContext, useCallback } from 'react'
import 'remixicon/fonts/remixicon.css'
import { createRide as createRideRequest, getActiveRide, getPassengerOtp, getRide, cancelRide, retryAssign } from '../services/rideService'
import { getFare } from '../services/fareService'
import { getSuggestions, getCoordinates } from '../services/mapService'
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
import welcomeBg from '../assets/rideeasy-welcome.png'
import { SERVICE_AREA_USER_MESSAGE, SERVICE_AREAS } from '../utils/serviceArea'
import { useLanguage } from '../i18n'
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
    const { t } = useLanguage()
    const [ pickup, setPickup ] = useState('')
    const [ destination, setDestination ] = useState('')
    const [ serviceCity, setServiceCity ] = useState(readStoredServiceCity)
    const [ panelOpen, setPanelOpen ] = useState(false)
    const [ searchOpen, setSearchOpen ] = useState(false)
    const homeMapRef = useRef(null)
    const [ homePosition, setHomePosition ] = useState(null)
    const [ flyToRequest, setFlyToRequest ] = useState(null)
    const vehiclePanelRef = useRef(null)
    const confirmRidePanelRef = useRef(null)
    const vehicleFoundRef = useRef(null)
    const waitingForDriverRef = useRef(null)
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
        return getRide(id)
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
                    return getPassengerOtp(id)
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
        if (!currentUser?._id) return
        const token = localStorage.getItem('token')
        if (!token) return
        /** Rides that already started resume on the full-screen /riding flow. */
        const resumeStartedRide = (data) => {
            const st = normalizeRideStatus(data?.status)
            if (st === 'started' || st === 'completed') {
                navigate('/riding', { state: { ride: data } })
                return true
            }
            return false
        }
        const id = sessionStorage.getItem(USER_RIDE_SESSION_KEY)
        if (id) {
            /** Load ride into state (pickup/drop/OTP) but do NOT auto-open sheets — user stays on “Find a trip”. */
            syncRideFromServer(id).then((data) => {
                if (!data) {
                    try { sessionStorage.removeItem(USER_RIDE_SESSION_KEY) } catch { /* ignore */ }
                    return
                }
                if (resumeStartedRide(data)) return
                const st = normalizeRideStatus(data.status)
                if (![ 'searching', 'accepted', 'arrived' ].includes(st)) {
                    try { sessionStorage.removeItem(USER_RIDE_SESSION_KEY) } catch { /* ignore */ }
                    return
                }
                setVehicleFound(false)
                setWaitingForDriver(false)
            })
            return
        }
        /** No session hint (fresh tab / app restart) — ask the backend for the active ride. */
        getActiveRide()
            .then((res) => {
                const raw = stripApiEnvelope(res.data)
                if (!raw?._id) return
                if (resumeStartedRide(raw)) return
                const st = normalizeRideStatus(raw.status)
                if (![ 'searching', 'accepted', 'arrived' ].includes(st)) return
                try { sessionStorage.setItem(USER_RIDE_SESSION_KEY, String(raw._id)) } catch { /* ignore */ }
                setRide(raw)
                setVehicleFound(false)
                setWaitingForDriver(false)
            })
            .catch(() => {})
    }, [ride, currentUser?._id, syncRideFromServer, navigate])

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
                alert(t('driver_accepted_ride'))
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
    }, [socket, navigate, hasShownAcceptAlert, syncRideFromServer, t]);

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
                    await retryAssign(ride._id).catch(() => {})
                }
                const res = await getRide(ride._id)
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
                        alert(t('driver_accepted_ride'))
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
    }, [ride, hasShownAcceptAlert, syncRideFromServer, t]);


    const handlePickupChange = async (e) => {
        const value = e.target.value
        setPickup(value)
        const trimmed = value.trim()
        if (!trimmed) {
            setPickupSuggestions([])
            return
        }
        try {
            const response = await getSuggestions(trimmed, serviceCity)
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
            const response = await getSuggestions(trimmed, serviceCity)
            setDestinationSuggestions(response.data)
        } catch {
            setDestinationSuggestions([])
        }
    }

    const fetchPickupCoords = async (address) => {
        if (!address?.trim()) return
        try {
            const res = await getCoordinates(address.trim())
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
            const res = await getCoordinates(address.trim())
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
        setPanelOpen(false)
        if (typeof suggestion === 'object' && suggestion?.lat != null && suggestion?.lng != null) {
            setPickupCoords({ lat: suggestion.lat, lng: suggestion.lng })
        } else {
            fetchPickupCoords(name)
        }
    }

    const handleSelectDestination = (suggestion) => {
        const name = typeof suggestion === 'string' ? suggestion : suggestion?.name
        if (!name) return
        setPanelOpen(false)
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
            alert(t('enter_pickup_drop_fare'))
            return
        }
        setPanelOpen(false)
        setBookingError('')
        try {
            const pickPromise = (pickupCoords?.lat != null && pickupCoords?.lng != null)
                ? Promise.resolve({ data: pickupCoords })
                : getCoordinates(p)
            const dropPromise = (dropCoords?.lat != null && dropCoords?.lng != null)
                ? Promise.resolve({ data: dropCoords })
                : getCoordinates(d)
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
                setBookingError(t('could_not_resolve_location'))
                return
            }
            const response = await getFare({
                pickup: p,
                destination: d,
                pickupLat: pu.lat,
                pickupLng: pu.lng,
                dropLat: du.lat,
                dropLng: du.lng,
            })
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
            alert(t('select_pickup_drop_vehicle'))
            return
        }
        try {
            setBookingError('')
            setRideConfirmation(null)
            setVehicleFound(true)
            setVehiclePanel(false)
            setConfirmRidePanel(false)
            const response = await createRideRequest({
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
            })
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

    /** Cancel the active ride on the backend, clear local state, return to search. */
    const cancelActiveRide = useCallback(async () => {
        const id = ride?._id
        if (!id) return
        try {
            await cancelRide(id, 'Cancelled by passenger')
        } catch (err) {
            alert(formatApiError(err))
            return
        }
        try { sessionStorage.removeItem(USER_RIDE_SESSION_KEY) } catch { /* ignore */ }
        setRide(null)
        setRideConfirmation(null)
        setPassengerOtp('')
        setDriverCoords(null)
        setVehicleFound(false)
        setWaitingForDriver(false)
        setHasShownAcceptAlert(false)
        setPickup('')
        setDestination('')
        setPickupCoords(null)
        setDropCoords(null)
        setFare({})
        setVehicleType(null)
    }, [ride?._id])

    const continueFromVehiclePanel = () => {
        if (!vehicleType) {
            alert(t('please_choose_ride'))
            return
        }
        setVehiclePanel(false)
        setConfirmRidePanel(true)
    }

    const openSearchFor = (field) => {
        setSearchOpen(true)
        setPanelOpen(true)
        setActiveField(field)
    }

    const locateMe = () => {
        if (homePosition?.lat != null && homePosition?.lng != null) {
            setFlyToRequest({ center: [homePosition.lat, homePosition.lng], zoom: 15 })
        }
    }

    const zoomMap = (delta) => {
        const map = homeMapRef.current
        if (!map) return
        const c = map.getCenter()
        setFlyToRequest({ center: [c.lat, c.lng], zoom: map.getZoom() + delta })
    }

    const inBookingFlow = vehiclePanel || confirmRidePanel || vehicleFound || waitingForDriver
    const showLanding = !inBookingFlow && !searchOpen

    const trackingDriverToPickup =
        waitingForDriver
        && driverCoords?.lat != null
        && pickupCoords?.lat != null

    return (
        <div className='h-screen relative overflow-hidden w-full max-w-full'>
            {showLanding ? (
                <div className="h-full w-full overflow-y-auto bg-night-950">
                    <div className="mx-auto flex min-h-full max-w-lg flex-col px-4 pb-28 pt-4">
                        <header className="flex items-center gap-3 animate-[rideeasy-fade-up_0.4s_ease-out_both]">
                            <img
                                className="h-11 w-11 rounded-xl border border-night-border bg-night-950/70 p-1"
                                src={getAppLogoUrl()}
                                alt="RideEasy"
                            />
                            <div className="leading-tight">
                                <h1 className="text-xl font-bold text-white">
                                    Ride<span className="text-brand">Easy</span>
                                </h1>
                                <p className="mt-0.5 text-xs text-zinc-500">{t('ride_anytime_anywhere')}</p>
                            </div>
                        </header>

                        <button
                            type="button"
                            onClick={() => openSearchFor('pickup')}
                            className="mt-4 animate-[rideeasy-fade-up_0.4s_ease-out_0.06s_both] rounded-2xl border border-night-border bg-night-900 p-4 text-left shadow-[0_4px_24px_rgba(0,0,0,0.35)] transition active:scale-[0.99]"
                        >
                            <div className="flex items-stretch gap-3">
                                <span className="flex flex-col items-center py-0.5">
                                    <span className="mt-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
                                    <span className="my-1 w-px flex-1 border-l-2 border-dotted border-zinc-600" />
                                    <span className="mb-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-red-500" />
                                </span>
                                <span className="flex min-w-0 flex-1 flex-col justify-center gap-3 py-0.5">
                                    <span className="min-w-0">
                                        <span className="block text-xs text-zinc-500">{t('pickup_location')}</span>
                                        <span className="block truncate text-sm font-medium text-white">{pickup || t('choose_pickup')}</span>
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-xs text-zinc-500">{t('drop_location')}</span>
                                        <span className="block truncate text-sm font-medium text-white">{destination || t('choose_drop')}</span>
                                    </span>
                                </span>
                                <span className="flex items-center text-zinc-400">
                                    <i className="ri-arrow-down-s-line text-2xl" />
                                </span>
                            </div>
                        </button>

                        <div className="relative mt-4 h-[40dvh] min-h-[280px] animate-[rideeasy-fade-up_0.4s_ease-out_0.12s_both] overflow-hidden rounded-3xl border border-night-border">
                            {pickupCoords || dropCoords ? (
                                <RideMap
                                    pickupCoords={pickupCoords}
                                    dropCoords={dropCoords}
                                    currentLocation={homePosition}
                                    showRoute={!!(pickupCoords && dropCoords)}
                                    mapRef={homeMapRef}
                                    flyTo={flyToRequest}
                                    zoomControl={false}
                                />
                            ) : (
                                <LiveTracking
                                    onPositionChange={setHomePosition}
                                    mapRef={homeMapRef}
                                    flyTo={flyToRequest}
                                    zoomControl={false}
                                />
                            )}
                            <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-2">
                                <button
                                    type="button"
                                    onClick={locateMe}
                                    aria-label="Locate me"
                                    className="flex h-11 w-11 items-center justify-center rounded-full border border-night-border bg-zinc-100 text-lg text-zinc-800 shadow-lg transition hover:bg-white active:scale-95"
                                >
                                    <i className="ri-crosshair-2-line" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => zoomMap(1)}
                                    aria-label="Zoom in"
                                    className="flex h-11 w-11 items-center justify-center rounded-full border border-night-border bg-zinc-100 text-lg text-zinc-800 shadow-lg transition hover:bg-white active:scale-95"
                                >
                                    <i className="ri-add-line" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => zoomMap(-1)}
                                    aria-label="Zoom out"
                                    className="flex h-11 w-11 items-center justify-center rounded-full border border-night-border bg-zinc-100 text-lg text-zinc-800 shadow-lg transition hover:bg-white active:scale-95"
                                >
                                    <i className="ri-subtract-line" />
                                </button>
                            </div>
                        </div>

                        <div className="mt-5 grid grid-cols-4 gap-2 animate-[rideeasy-fade-up_0.4s_ease-out_0.18s_both]">
                            <button
                                type="button"
                                onClick={() => openSearchFor('pickup')}
                                className="flex flex-col items-center gap-1.5 transition active:scale-95"
                            >
                                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-xl text-black shadow-[0_4px_16px_rgba(255,168,0,0.35)]">
                                    <i className="ri-flashlight-line" />
                                </span>
                                <span className="text-xs font-medium text-white">{t('ride_now')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => alert(t('coming_soon'))}
                                className="flex flex-col items-center gap-1.5 transition active:scale-95"
                            >
                                <span className="flex h-14 w-14 items-center justify-center rounded-full border border-night-border bg-night-800 text-xl text-zinc-300">
                                    <i className="ri-calendar-line" />
                                </span>
                                <span className="text-xs font-medium text-zinc-300">{t('schedule')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => alert(t('coming_soon'))}
                                className="flex flex-col items-center gap-1.5 transition active:scale-95"
                            >
                                <span className="flex h-14 w-14 items-center justify-center rounded-full border border-night-border bg-night-800 text-xl text-zinc-300">
                                    <i className="ri-road-map-line" />
                                </span>
                                <span className="text-xs font-medium text-zinc-300">{t('outstation')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => alert(t('coming_soon'))}
                                className="flex flex-col items-center gap-1.5 transition active:scale-95"
                            >
                                <span className="flex h-14 w-14 items-center justify-center rounded-full border border-night-border bg-night-800 text-xl text-zinc-300">
                                    <i className="ri-grid-fill" />
                                </span>
                                <span className="text-xs font-medium text-zinc-300">{t('more')}</span>
                            </button>
                        </div>

                        <div className="mt-4 flex items-center justify-between overflow-hidden rounded-2xl border border-night-border bg-night-900 pr-2 animate-[rideeasy-fade-up_0.4s_ease-out_0.24s_both]">
                            <div className="px-4 py-4">
                                <p className="text-base font-semibold text-white">{t('safe_rides')}</p>
                                <p className="mt-0.5 text-sm font-medium text-zinc-400">{t('better_tomorrow')}</p>
                                <p className="mt-1 text-xs text-zinc-500">{t('ride_with_verified_driver')}</p>
                            </div>
                            <img
                                src={welcomeBg}
                                alt="RideEasy vehicle"
                                className="h-24 w-28 shrink-0 object-cover"
                            />
                        </div>
                    </div>
                </div>
            ) : (
            <>
            <div className="absolute z-20 top-4 left-0 right-0 flex justify-center pointer-events-none">
                <img
                    className="w-16 rounded-2xl bg-night-950/70 p-1.5 backdrop-blur-sm"
                    src={getAppLogoUrl()}
                    alt="RideEasy"
                />
            </div>
            <div className='h-screen w-full relative z-0'>
                {inBookingFlow ? (
                    (pickupCoords || dropCoords) ? (
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
                    )
                ) : (
                    <div className="h-full w-full bg-gradient-to-b from-night-800 via-night-950 to-black" />
                )}
            </div>
            {searchOpen && (
                <div className="absolute inset-0 z-20 mx-auto flex w-full max-w-lg flex-col px-4 pt-20 pb-4">
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-night-border bg-night-900/95 backdrop-blur-md text-zinc-100 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
                        <header className="shrink-0 border-b border-night-border px-6 pb-4 pt-5">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h4 className="text-2xl font-semibold text-white">{t('find_a_trip')}</h4>
                                    <p className="mt-1 text-xs text-zinc-500">{SERVICE_AREA_USER_MESSAGE}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSearchOpen(false)}
                                    aria-label={t('back')}
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-night-border bg-night-800 text-zinc-300 transition hover:text-white"
                                >
                                    <i className="ri-arrow-left-line text-lg" />
                                </button>
                            </div>
                        </header>
                        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                            <label htmlFor="user-service-city" className="mb-1 block text-xs font-medium text-zinc-500">{t('city_for_search')}</label>
                            <select
                                id="user-service-city"
                                value={serviceCity}
                                onChange={(e) => setServiceCity(e.target.value)}
                                className="w-full rounded-xl border border-night-border bg-night-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand/60"
                            >
                                {SERVICE_AREAS.map((z) => (
                                    <option key={`${z.key}-${z.name}`} value={z.key}>{z.name}</option>
                                ))}
                            </select>
                            {bookingError ? (
                                <div
                                    role="alert"
                                    className="mt-3 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200 whitespace-pre-line"
                                >
                                    {bookingError}
                                </div>
                            ) : null}
                            <form className="mt-4" onSubmit={(e) => {
                                submitHandler(e)
                            }}>
                                <div>
                                    <label htmlFor="user-pickup" className="mb-1 block text-xs font-medium text-zinc-500">{t('from')}</label>
                                    <input
                                        id="user-pickup"
                                        onClick={() => {
                                            setPanelOpen(true)
                                            setActiveField('pickup')
                                        }}
                                        value={pickup}
                                        onChange={handlePickupChange}
                                        className='bg-night-800 border border-night-border px-4 py-3 text-base rounded-xl w-full text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand/60 focus:border-brand'
                                        type="text"
                                        autoComplete="off"
                                        placeholder={t('pickup_address')}
                                    />
                                </div>
                                {panelOpen && activeField === 'pickup' ? (
                                    <div className="mt-2 overflow-hidden rounded-xl border border-night-border bg-night-900">
                                        <LocationSearchPanel
                                            suggestions={pickupSuggestions}
                                            setPickup={setPickup}
                                            setDestination={setDestination}
                                            activeField={activeField}
                                            onSelectPickup={handleSelectPickup}
                                            onSelectDestination={handleSelectDestination}
                                        />
                                    </div>
                                ) : null}
                                <div className="mt-3">
                                    <label htmlFor="user-drop" className="mb-1 block text-xs font-medium text-zinc-500">{t('to')}</label>
                                    <input
                                        id="user-drop"
                                        onClick={() => {
                                            setPanelOpen(true)
                                            setActiveField('destination')
                                        }}
                                        value={destination}
                                        onChange={handleDestinationChange}
                                        className='bg-night-800 border border-night-border px-4 py-3 text-base rounded-xl w-full text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand/60 focus:border-brand'
                                        type="text"
                                        autoComplete="off"
                                        placeholder={t('drop_destination')}
                                    />
                                </div>
                                {panelOpen && activeField === 'destination' ? (
                                    <div className="mt-2 overflow-hidden rounded-xl border border-night-border bg-night-900">
                                        <LocationSearchPanel
                                            suggestions={destinationSuggestions}
                                            setPickup={setPickup}
                                            setDestination={setDestination}
                                            activeField={activeField}
                                            onSelectPickup={handleSelectPickup}
                                            onSelectDestination={handleSelectDestination}
                                        />
                                    </div>
                                ) : null}
                                {(currentUser?.savedAddresses?.home || currentUser?.savedAddresses?.work) && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {currentUser.savedAddresses?.home ? (
                                            <button
                                                type="button"
                                                className="rounded-full border border-night-border bg-night-800 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-night-700"
                                                onClick={() => {
                                                    const a = currentUser.savedAddresses.home
                                                    setPickup(a)
                                                    fetchPickupCoords(a)
                                                }}
                                            >
                                                {t('home_to_pickup')}
                                            </button>
                                        ) : null}
                                        {currentUser.savedAddresses?.work ? (
                                            <button
                                                type="button"
                                                className="rounded-full border border-night-border bg-night-800 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-night-700"
                                                onClick={() => {
                                                    const a = currentUser.savedAddresses.work
                                                    setDestination(a)
                                                    fetchDropCoords(a)
                                                }}
                                            >
                                                {t('work_to_drop')}
                                            </button>
                                        ) : null}
                                        {currentUser.savedAddresses?.home ? (
                                            <button
                                                type="button"
                                                className="rounded-full border border-night-border bg-night-800 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-night-700"
                                                onClick={() => {
                                                    const a = currentUser.savedAddresses.home
                                                    setDestination(a)
                                                    fetchDropCoords(a)
                                                }}
                                            >
                                                {t('home_to_drop')}
                                            </button>
                                        ) : null}
                                        {currentUser.savedAddresses?.work ? (
                                            <button
                                                type="button"
                                                className="rounded-full border border-night-border bg-night-800 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-night-700"
                                                onClick={() => {
                                                    const a = currentUser.savedAddresses.work
                                                    setPickup(a)
                                                    fetchPickupCoords(a)
                                                }}
                                            >
                                                {t('work_to_pickup')}
                                            </button>
                                        ) : null}
                                    </div>
                                )}
                            </form>
                        </div>
                        <footer className="shrink-0 border-t border-night-border px-6 py-4">
                            <button
                                type="button"
                                onClick={findTrip}
                                disabled={
                                    !(pickup || '').trim()
                                    || !(destination || '').trim()
                                }
                                className='w-full rounded-xl bg-brand px-4 py-3.5 text-base font-bold text-black hover:bg-brand-light disabled:opacity-50 disabled:cursor-not-allowed transition'>
                                {t('find_trip')}
                                <i className="ri-arrow-right-line ml-2" aria-hidden />
                            </button>
                        </footer>
                    </div>
                </div>
            )}
            <div ref={vehiclePanelRef} className={`absolute inset-x-0 w-full z-40 bottom-0 bg-night-900 border-t border-night-border text-zinc-100 px-6 pt-10 pb-20 rounded-t-3xl max-h-[90dvh] flex flex-col overflow-hidden shadow-[0_-8px_40px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-in-out ${(vehiclePanel && !confirmRidePanel) ? 'translate-y-0' : 'translate-y-full'}`}>
                <div className="flex min-h-0 flex-1 flex-col">
                    <VehiclePanel
                        selectedVehicle={vehicleType}
                        onSelectVehicle={handleVehicleTap}
                        onContinue={continueFromVehiclePanel}
                        city={String(serviceCity || 'Kolhapur').toLowerCase()}
                        fare={fare}
                        setConfirmRidePanel={setConfirmRidePanel}
                        setVehiclePanel={(v) => {
                            setVehiclePanel(v)
                            if (!v) {
                                setSearchOpen(true)
                                setPanelOpen(false)
                                setActiveField(null)
                            }
                        }} />
                </div>
            </div>
            <div ref={confirmRidePanelRef} className={`absolute inset-x-0 w-full z-50 bottom-0 bg-night-900 border-t border-night-border text-zinc-100 px-6 py-6 pt-12 pb-24 rounded-t-3xl max-h-[92dvh] overflow-y-auto shadow-[0_-8px_40px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-in-out ${confirmRidePanel ? 'translate-y-0' : 'translate-y-full'}`}>
                <ConfirmRide
                    createRide={createRide}
                    pickup={pickup}
                    destination={destination}
                    fare={fare}
                    vehicleType={vehicleType}

                    setConfirmRidePanel={(v) => {
                        setConfirmRidePanel(v)
                        if (!v) {
                            setSearchOpen(true)
                            setPanelOpen(false)
                            setActiveField(null)
                        }
                    }} setVehicleFound={setVehicleFound} />
            </div>
            <div ref={vehicleFoundRef} className={`absolute inset-x-0 w-full z-50 bottom-0 bg-night-900 border-t border-night-border text-zinc-100 px-6 py-6 pt-12 pb-24 rounded-t-3xl transition-transform duration-300 ease-in-out ${vehicleFound ? 'translate-y-0' : 'translate-y-full'}`}>
                <LookingForDriver
                    createRide={createRide}
                    pickup={pickup}
                    destination={destination}
                    fare={fare}
                    vehicleType={vehicleType}
                    ride={ride}
                    passengerOtp={passengerOtp}
                    setVehicleFound={setVehicleFound}
                    onCancelRide={cancelActiveRide}
                    onCollapse={() => {
                        setSearchOpen(true)
                        setPanelOpen(false)
                        setActiveField(null)
                    }}
                    onEditLocations={() => {
                        setVehicleFound(false)
                        setSearchOpen(true)
                        setPanelOpen(true)
                        setActiveField('pickup')
                    }} />
            </div>
            <div ref={waitingForDriverRef} className={`absolute inset-x-0 w-full z-50 bottom-0 bg-night-900 border-t border-night-border text-zinc-100 px-6 py-6 pt-12 pb-24 rounded-t-3xl transition-transform duration-300 ease-in-out ${waitingForDriver ? 'translate-y-0' : 'translate-y-full'}`}>
                <WaitingForDriver
                    ride={ride}
                    confirmation={rideConfirmation}
                    passengerOtp={passengerOtp}
                    driverCoords={driverCoords}
                    pickupCoords={pickupCoords}
                    setVehicleFound={setVehicleFound}
                    onCloseWaiting={() => {
                        setWaitingForDriver(false)
                        setSearchOpen(true)
                        setPanelOpen(false)
                        setActiveField(null)
                    }}
                    onCancelRide={cancelActiveRide}
                    waitingForDriver={waitingForDriver} />
            </div>
            </>
            )}
        </div>
    )
}

export default Home
