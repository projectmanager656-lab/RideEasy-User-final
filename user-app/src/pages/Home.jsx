import React, { useEffect, useRef, useState, useContext, useCallback } from 'react'
import 'remixicon/fonts/remixicon.css'
import { apiClient, withAuth } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { stripApiEnvelope } from '../utils/apiBody'
import { RIDE_ACCEPTED, RIDE_STARTED, RIDE_COMPLETED, LOCATION_UPDATE } from '../constants/rideSocketEvents'
import VehiclePanel from '../components/VehiclePanel';
import ConfirmRide from '../components/ConfirmRide';
import LookingForDriver from '../components/LookingForDriver';
import WaitingForDriver from '../components/WaitingForDriver';
import { useSocket } from '../hooks/useSocket';
import { UserDataContext } from '../context/UserContext';
import { useNavigate, useLocation } from 'react-router-dom';
import RideMap from '../components/RideMap';
import RideEasyHeader from '../components/RideEasyHeader';
import LocationSelector from '../components/LocationSelector';
import ForMeSheet from '../components/ForMeSheet';
import SafetyPromoCard from '../components/SafetyPromoCard';
import ScheduleModal from '../components/ScheduleModal';
import { SERVICE_AREAS } from '../utils/serviceArea'
import { findRideTier, findTierByBackendType } from '../constants/rideTiers'
import { searchServiceAreaPlaces } from '../constants/serviceAreaPlaces'
import { addRecentSearch, getRecentSearches } from '../utils/recentSearches'
import { useLanguage } from '../i18n'
const USER_RIDE_SESSION_KEY = 'rideeasy_user_ride'
const DRAFT_BOOKING_KEY = 'rideeasy_draft_booking'

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

/** Merge deterministic local results first, then de-duped live API results. */
function mergeServicePlaces(localList, apiList) {
    const seen = new Set()
    const out = []
    for (const item of [ ...localList, ...apiList ]) {
        const key = String(item?.name || '').trim().toLowerCase()
        if (!key || seen.has(key)) continue
        seen.add(key)
        out.push(item)
    }
    return out
}

const Home = () => {
    const { t } = useLanguage()
    const [ pickup, setPickup ] = useState('')
    const [ destination, setDestination ] = useState('')
    const [ serviceCity ] = useState(readStoredServiceCity)
    const [ recentSearches, setRecentSearches ] = useState(getRecentSearches)
    const [ forMeUsers, setForMeUsers ] = useState([ { name: 'Me', phone: '' } ])
    const [ forMeActive, setForMeActive ] = useState('Me')
    const [ forMeOpen, setForMeOpen ] = useState(false)
    const [ pickupSuggestions, setPickupSuggestions ] = useState([])
    const [ destinationSuggestions, setDestinationSuggestions ] = useState([])
    const [ activeField, setActiveField ] = useState(null)
    const [ searchStatus, setSearchStatus ] = useState('idle')
    const searchTimerRef = useRef(null)
    const searchSeqRef = useRef(0)
    const vehiclePanelRef = useRef(null)
    const confirmRidePanelRef = useRef(null)
    const vehicleFoundRef = useRef(null)
    const waitingForDriverRef = useRef(null)
    const [ vehiclePanel, setVehiclePanel ] = useState(false)
    const [ confirmRidePanel, setConfirmRidePanel ] = useState(false)
    const [ vehicleFound, setVehicleFound ] = useState(false)
    const [ waitingForDriver, setWaitingForDriver ] = useState(false)
    const [ fare, setFare ] = useState({})
    const [ vehicleType, setVehicleType ] = useState(null)
    const [ ride, setRide ] = useState(null)
    const [ pickupCoords, setPickupCoords ] = useState(null)
    const [ dropCoords, setDropCoords ] = useState(null)
    const [ driverCoords, setDriverCoords ] = useState(null)
    const [ passengerCoords, setPassengerCoords ] = useState(null)
    const [ passengerOtp, setPassengerOtp ] = useState('')
    const [ rideConfirmation, setRideConfirmation ] = useState(null)
    const [ bookingError, setBookingError ] = useState('')
    const [ findingTrip, setFindingTrip ] = useState(false)
    const [ scheduleOpen, setScheduleOpen ] = useState(false)
    const [ notificationsOpen, setNotificationsOpen ] = useState(false)
    const [ scheduledAt, setScheduledAt ] = useState(null)
    const [ assignmentError, setAssignmentError ] = useState('')
    const [ pickupSelection, setPickupSelection ] = useState(null)
    const [ dropSelection, setDropSelection ] = useState(null)
    /** Locks concurrent retry-assign calls; bounds the retry budget across polls. */
    const retryAssignLockRef = useRef(false)
    const retryAttemptRef = useRef(0)
    const passengerOtpRef = useRef('')
    passengerOtpRef.current = passengerOtp
    const rideRef = useRef(null)
    rideRef.current = ride
    const socketOtpSyncTimer = useRef(null)
    /** Avoid spamming maps geocode when ride polls return the same addresses without GeoJSON. */
    const rideGeocodeOnceRef = useRef({ pick: '', drop: '' })
    /** On app open, keep search form visible until user explicitly resumes/creates a ride. */
    const keepSearchFirstRef = useRef(true)
    /** True when Home restored an active ride from the session key (refresh / re-entry). */
    const resumedRideFromSessionRef = useRef(false)

    const navigate = useNavigate()
    const location = useLocation()

    useEffect(() => {
        try {
            localStorage.setItem('rideeasy_user_service_city', serviceCity)
        } catch { /* ignore */ }
    }, [serviceCity])

    useEffect(() => () => {
        clearTimeout(searchTimerRef.current)
    }, [])

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
    const hasRide = Boolean(ride)
    const rideStatus = normalizeRideStatus(ride?.status)
    useEffect(() => {
        const activeRide =
            vehicleFound
            || waitingForDriver
            || (hasRide && [ 'searching', 'accepted', 'arrived', 'started' ].includes(rideStatus))
        if (!socket || !currentUser?._id || !activeRide || !navigator.geolocation) {
            if (!activeRide) setPassengerCoords(null)
            return
        }
        let emitTimer
        let watchId = null
        const stopOnLocationError = () => {
            if (watchId != null) navigator.geolocation.clearWatch(watchId)
        }
        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = pos.coords.latitude
                const lng = pos.coords.longitude
                setPassengerCoords({ lat, lng })
                clearTimeout(emitTimer)
                emitTimer = setTimeout(() => {
                    socket.emit('user:location-update', { lat, lng })
                }, 800)
            },
            stopOnLocationError,
            { enableHighAccuracy: true, maximumAge: 10_000 }
        )
        return () => {
            clearTimeout(emitTimer)
            navigator.geolocation.clearWatch(watchId)
        }
    }, [socket, currentUser?._id, vehicleFound, waitingForDriver, hasRide, rideStatus, ride?._id])

    /** Restore active booking after refresh (ride id in sessionStorage). */
    useEffect(() => {
        if (ride?._id) return
        if (location.state?.chooseRideResult) return
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
            if (st === 'started' || st === 'completed') {
                /* Refresh during a live/completed ride — take the passenger back
                   to the ride screen with the fresh server ride. */
                navigate('/riding', {
                    replace: true,
                    state: { ride: { ...data, status: st } },
                })
                return
            }
            if (![ 'searching', 'accepted', 'arrived' ].includes(st)) {
                try { sessionStorage.removeItem(USER_RIDE_SESSION_KEY) } catch { /* ignore */ }
                return
            }
            resumedRideFromSessionRef.current = true
            setVehicleFound(false)
            setWaitingForDriver(false)
        })
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
                if (st === 'completed' || st === 'cancelled') {
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
                    setVehicleFound(false)
                    setPassengerOtp('')
                    /* Jump to the live-ride screen when the passenger is actively
                       in this booking flow (created here) or resumed it from the
                       session key (refresh / re-entry mid-ride). An idle Home
                       tab never hijacks navigation — the ride stays recoverable
                       from the Live tab via the session key. */
                    if (!keepSearchFirstRef.current || resumedRideFromSessionRef.current) {
                        const r = data.ride || rideRef.current
                        navigate('/riding', { state: { ride: { ...(r || {}), status: 'started' } } })
                    }
                }
                if (st === 'completed') {
                    const completedRide = {
                        ...(rideRef.current || {}),
                        ...(data.ride || {}),
                        status: 'completed',
                    }
                    try {
                        sessionStorage.removeItem(USER_RIDE_SESSION_KEY)
                    } catch { /* ignore */ }
                    navigate('/riding', { replace: true, state: { ride: completedRide } })
                    return
                }
                if (st === 'cancelled') {
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
    }, [socket, navigate, syncRideFromServer]);

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

    /**
     * Controlled ride polling + bounded retry-assign while searching.
     * Root-cause fix: the old effect depended on `ride` (an object) and re-ran on every
     * `setRide(data)` — each re-run fired poll() + retry-assign immediately, creating a
     * self-perpetuating loop that hammered the API into 429 territory.
     */
    useEffect(() => {
        const rideId = ride?._id
        const st = normalizeRideStatus(ride?.status)
        const hasCaptain = !!(ride?.captain?._id || ride?.captain)
        if (!rideId || (st && st !== 'searching') || hasCaptain) return

        let cancelled = false
        let intervalId = null
        let backoffTimer = null

        const stopTimers = () => {
            if (intervalId) {
                clearInterval(intervalId)
                intervalId = null
            }
            if (backoffTimer) {
                clearTimeout(backoffTimer)
                backoffTimer = null
            }
        }

        /** Stop the whole loop and surface a compact message — never keep hammering. */
        const markUnavailable = () => {
            setAssignmentError(t('driver_assignment_unavailable'))
            stopTimers()
        }

        /** Bounded retry-assign: max 3 attempts, 1s/2s/4s backoff, respects Retry-After. */
        const retryAssign = async () => {
            if (cancelled || retryAssignLockRef.current || retryAttemptRef.current >= 3) return
            retryAssignLockRef.current = true
            try {
                const res = await apiClient.post(`/rides/${rideId}/retry-assign`, {}, withAuth())
                if (cancelled) return
                if (res.status >= 200 && res.status < 300) retryAttemptRef.current = 0
            } catch (err) {
                if (cancelled) return
                const retryAfter = Number(err?.response?.headers?.['retry-after'] ?? 0)
                if (err?.response?.status === 429 || retryAfter > 0) {
                    retryAttemptRef.current += 1
                    if (retryAttemptRef.current >= 3) {
                        markUnavailable()
                        return
                    }
                    const delay = retryAfter > 0
                        ? retryAfter * 1000
                        : Math.min(1000 * (2 ** (retryAttemptRef.current - 1)), 4000)
                    backoffTimer = setTimeout(retryAssign, delay)
                    return
                }
                retryAttemptRef.current += 1
            } finally {
                retryAssignLockRef.current = false
            }
        }

        const poll = async () => {
            if (cancelled) return
            try {
                const res = await apiClient.get(`/rides/${rideId}`, withAuth())
                if (cancelled) return

                const { ride: data, confirmation: conf } = splitRideApiPayload(res.data)
                const dst = normalizeRideStatus(data?.status)
                if (data?._id && dst !== 'searching') {
                    stopTimers()
                    setRide(data)
                    if (conf) setRideConfirmation(conf)
                    if (dst === 'accepted' || dst === 'arrived') {
                        setVehicleFound(false)
                        setWaitingForDriver(true)
                        setAssignmentError('')
                        syncRideFromServer(data._id)
                    }
                    if (dst === 'started' || dst === 'completed') setAssignmentError('')
                    return
                }
                setRide(data)
                if (conf) setRideConfirmation(conf)
                if (conf?.liveLocation?.lat != null && conf?.liveLocation?.lng != null) {
                    setDriverCoords({ lat: conf.liveLocation.lat, lng: conf.liveLocation.lng })
                }
                if (data?.otp) setPassengerOtp(String(data.otp).trim())
            } catch (err) {
                if (cancelled) return
                /* A single 429 stops the entire loop — no infinite retry. */
                if (err?.response?.status === 429) {
                    markUnavailable()
                    return
                }
                /* Transient network/5xx: keep the normal polling cadence. */
            }
        }

        poll()
        retryAssign()
        intervalId = setInterval(() => {
            poll()
            retryAssign()
        }, 8000)

        return () => {
            cancelled = true
            stopTimers()
        }
}, [ride?._id, ride?.status, ride?.captain, syncRideFromServer, t]);


    /** Debounced prefix search with stale-response protection and graceful 429 handling. */
    const runLocationSearch = (field, query) => {
        const trimmed = (query || '').trim()
        const seq = ++searchSeqRef.current
        clearTimeout(searchTimerRef.current)
        if (!trimmed) {
            setSearchStatus('idle')
            setPickupSuggestions([])
            setDestinationSuggestions([])
            return
        }
        setSearchStatus('loading')
        searchTimerRef.current = setTimeout(async () => {
            const localList = searchServiceAreaPlaces(trimmed, 8)
            let merged = localList
            try {
                if (trimmed.length >= 3) {
                    const response = await apiClient.get('/maps/get-suggestions', withAuth({
                        params: { input: trimmed },
                    }))
                    if (seq !== searchSeqRef.current) return
                    const raw = Array.isArray(response.data) ? response.data : []
                    const cityKeys = SERVICE_AREAS.map((z) => z.key.toLowerCase())
                    const apiList = raw
                        .filter((s) => {
                            const n = String(s?.name || '').trim()
                            const nl = n.toLowerCase()
                            return (
                                s?.lat != null && s?.lng != null
                                && n.length > 3
                                && cityKeys.some((ck) => nl.includes(ck))
                            )
                        })
                        .map((s) => ({ name: s.name, lat: s.lat, lng: s.lng, source: 'api' }))
                    merged = mergeServicePlaces(localList, apiList)
                }
            } catch {
                if (seq !== searchSeqRef.current) return
            }
            if (seq !== searchSeqRef.current) return
            if (field === 'pickup') setPickupSuggestions(merged)
            else setDestinationSuggestions(merged)
            setSearchStatus(merged.length ? 'done' : 'empty')
        }, 300)
    }

    const handlePickupChange = (e) => {
        const value = e.target.value
        chooseRideSentRef.current = false
        setPickup(value)
        if (pickupSelection && value.trim() !== pickupSelection.name) {
            setPickupSelection(null)
            setPickupCoords(null)
        }
        runLocationSearch('pickup', value)
    }

    const handleDestinationChange = (e) => {
        const value = e.target.value
        chooseRideSentRef.current = false
        setDestination(value)
        if (dropSelection && value.trim() !== dropSelection.name) {
            setDropSelection(null)
            setDropCoords(null)
        }
        runLocationSearch('destination', value)
    }

    const fetchPickupCoords = async (address) => {
        if (!address?.trim()) return null
        try {
            const res = await apiClient.get('/maps/get-coordinates', withAuth({
                params: { address: address.trim() },
            }))
            if (res.data?.lat != null && res.data?.lng != null) {
                const c = { lat: res.data.lat, lng: res.data.lng }
                setPickupCoords(c)
                return c
            }
        } catch {
            setPickupCoords(null)
        }
        return null
    }

    const fetchDropCoords = async (address) => {
        if (!address?.trim()) return null
        try {
            const res = await apiClient.get('/maps/get-coordinates', withAuth({
                params: { address: address.trim() },
            }))
            if (res.data?.lat != null && res.data?.lng != null) {
                const c = { lat: res.data.lat, lng: res.data.lng }
                setDropCoords(c)
                return c
            }
        } catch {
            setDropCoords(null)
        }
        return null
    }

    const handleSelectRecent = async (item) => {
        const from = String(item.pickup || '').trim()
        const to = String(item.destination || item.name || '').trim()
        if (!to) return
        chooseRideSentRef.current = false
        setBookingError('')
        setPickup(from)
        setDestination(to)
        if (from) addRecentSearch({ pickup: from, destination: to })
        else addRecentSearch({ name: to })
        setRecentSearches(getRecentSearches())
        const pc = from ? await fetchPickupCoords(from) : null
        const dc = await fetchDropCoords(to)
        if (pc) {
            setPickupCoords(pc)
            setPickupSelection({ name: from, latitude: pc.lat, longitude: pc.lng })
        }
        if (dc) {
            setDropCoords(dc)
            setDropSelection({ name: to, latitude: dc.lat, longitude: dc.lng })
        }
        if (!pc || !dc) {
            setBookingError(t('could_not_resolve_locations'))
        }
    }

    /** Select a pickup suggestion from the search panel. */
    const handleSelectPickup = async (suggestion) => {
        const name = typeof suggestion === 'string' ? suggestion : suggestion?.name
        if (!name) return
        clearTimeout(searchTimerRef.current)
        setSearchStatus('idle')
        setPickupSuggestions([])
        setActiveField(null)
        setPickup(name)
        setBookingError('')
        let coords = null
        if (typeof suggestion === 'object' && suggestion?.lat != null && suggestion?.lng != null) {
            coords = { lat: suggestion.lat, lng: suggestion.lng }
        } else {
            coords = await fetchPickupCoords(name)
        }
        if (coords?.lat != null && coords?.lng != null) {
            setPickupCoords(coords)
            setPickupSelection({ name, latitude: coords.lat, longitude: coords.lng })
        } else {
            setPickupCoords(null)
            setPickupSelection(null)
            setBookingError(t('could_not_resolve_pickup'))
        }
    }

    /** Select a drop suggestion from the search panel — also records a recent search. */
    const handleSelectDestination = async (suggestion) => {
        const name = typeof suggestion === 'string' ? suggestion : suggestion?.name
        if (!name) return
        clearTimeout(searchTimerRef.current)
        setSearchStatus('idle')
        setDestinationSuggestions([])
        setActiveField(null)
        setDestination(name)
        setBookingError('')
        addRecentSearch({
            pickup: pickup?.trim() || '',
            destination: name,
            detail: typeof suggestion === 'object' && suggestion?.description ? suggestion.description : '',
        })
        setRecentSearches(getRecentSearches())
        let coords = null
        if (typeof suggestion === 'object' && suggestion?.lat != null && suggestion?.lng != null) {
            coords = { lat: suggestion.lat, lng: suggestion.lng }
        } else {
            coords = await fetchDropCoords(name)
        }
        if (coords?.lat != null && coords?.lng != null) {
            setDropCoords(coords)
            setDropSelection({ name, latitude: coords.lat, longitude: coords.lng })
        } else {
            setDropCoords(null)
            setDropSelection(null)
            setBookingError(t('could_not_resolve_drop'))
        }
    }

    /** Route a tapped suggestion to the pickup or drop handler based on the focused field. */
    const handleSelectSuggestion = (suggestion) => {
        if (activeField === 'pickup') handleSelectPickup(suggestion)
        else if (activeField === 'destination') handleSelectDestination(suggestion)
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
            setVehicleType((prev) => prev || (findTierByBackendType(ride.vehicleType)?.id ?? ride.vehicleType))
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

    // Replaced GSAP with Tailwind transitions for better reliability.

    const handleScheduleContinue = (iso) => {
        setScheduledAt(iso)
        setScheduleOpen(false)
        findTrip(iso)
    }

    async function findTrip(scheduledOverride = scheduledAt) {
        if (!pickupSelection || !dropSelection) {
            setBookingError(t('select_both_pickup_drop'))
            return
        }
        const p = (pickupSelection.name || '').trim()
        const d = (dropSelection.name || '').trim()
        if (!p || !d) {
            setBookingError(t('select_pickup_and_drop_for_fare'))
            return
        }
        if (p.toLowerCase() === d.toLowerCase()) {
            setBookingError(t('pickup_destination_same'))
            return
        }
        setBookingError('')
        setFindingTrip(true)
        try {
            const pu = { lat: pickupSelection.latitude, lng: pickupSelection.longitude }
            const du = { lat: dropSelection.latitude, lng: dropSelection.longitude }
            setPickupCoords(pu)
            setDropCoords(du)
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
            const farePayload = stripApiEnvelope(response.data) || {}
            setFare(farePayload)
            chooseRideSentRef.current = true
            try {
                sessionStorage.setItem(DRAFT_BOOKING_KEY, JSON.stringify({
                    pickup: p,
                    destination: d,
                    pickupCoords: pu,
                    dropCoords: du,
                    pickupSelection,
                    dropSelection,
                    fare: farePayload,
                    scheduledAt: scheduledOverride || null,
                }))
            } catch { /* ignore */ }
            navigate('/choose-ride', {
                state: {
                    pickup: p,
                    destination: d,
                    pickupCoords: pu,
                    dropCoords: du,
                    pickupSelection,
                    dropSelection,
                    fare: farePayload,
                    scheduledAt: scheduledOverride || null,
                },
            })
        } catch (err) {
            if (err?.response?.status === 429) {
                setBookingError(t('location_search_busy'))
            } else {
                setBookingError(formatApiError(err))
            }
        } finally {
            setFindingTrip(false)
        }
    }

    async function createRide(opts = {}) {
        keepSearchFirstRef.current = false
        const { paymentMethod = 'Cash' } = opts
        const tier = findRideTier(vehicleType)
        const vehicleTypeNorm = tier ? tier.vehicleType : 'AUTO'
        const price = tier ? tier.fare : (fare[vehicleTypeNorm] ?? fare[vehicleType] ?? null)
        if (price == null) {
            alert(t('select_pickup_drop_vehicle'))
            return
        }
        try {
            setBookingError('')
            setAssignmentError('')
            retryAttemptRef.current = 0
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
                distanceKm: fare.distanceKm,
                ...(scheduledAt ? { scheduledAt } : {})
            }, withAuth())
            const raw = stripApiEnvelope(response.data)
            const ridePayload = { ...(raw?.ride && typeof raw.ride === 'object' ? raw.ride : raw) }
            delete ridePayload.otp
            setRide(ridePayload)
            setPassengerOtp('')
            setDriverCoords(null)
            if (pickup?.trim() || destination?.trim()) {
                addRecentSearch({ pickup, destination })
                setRecentSearches(getRecentSearches())
            }
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
            alert(t('please_choose_ride'))
            return
        }
        setVehiclePanel(false)
        setConfirmRidePanel(true)
    }

    const showSearchPanel = !(vehiclePanel || confirmRidePanel || vehicleFound || waitingForDriver)

    /** Map + Ride Now are driven ONLY by real selected locations (typing never counts). */
    const hasRouteSelections = !!(
        pickupSelection?.latitude != null
        && pickupSelection?.longitude != null
        && dropSelection?.latitude != null
        && dropSelection?.longitude != null
    )

    const trackingDriverToPickup =
        waitingForDriver
        && driverCoords?.lat != null
        && pickupCoords?.lat != null

    const closeWaitingPanel = () => {
        setWaitingForDriver(false)
        setVehicleFound(false)
        setConfirmRidePanel(false)
        setVehiclePanel(false)
    }

    /** Guards repeated handoffs while preserving the location draft for back navigation. */
    const chooseRideSentRef = useRef(false)

    /** Restore the pickup/drop draft when returning from the Choose Ride screen (Back). */
    useEffect(() => {
        if (ride?._id) return
        if (location.state?.chooseRideResult) return
        let draft = null
        try {
            draft = JSON.parse(sessionStorage.getItem(DRAFT_BOOKING_KEY) || 'null')
        } catch { draft = null }
        if (!draft || typeof draft !== 'object') return
        if (draft.pickupCoords?.lat != null) setPickupCoords(draft.pickupCoords)
        if (draft.dropCoords?.lat != null) setDropCoords(draft.dropCoords)
        if (draft.pickup) setPickup(draft.pickup)
        if (draft.destination) setDestination(draft.destination)
        if (draft.pickupSelection) setPickupSelection(draft.pickupSelection)
        if (draft.dropSelection) setDropSelection(draft.dropSelection)
        chooseRideSentRef.current = true
        try {
            sessionStorage.removeItem(DRAFT_BOOKING_KEY)
        } catch { /* ignore */ }
    }, [ ride?._id ])

    /** Handoff from the Choose Ride screen: open the existing "Looking for driver" state. */
    const chooseRideConsumedRef = useRef(false)
    useEffect(() => {
        const incoming = location.state?.chooseRideResult
        if (!incoming || chooseRideConsumedRef.current) return
        chooseRideConsumedRef.current = true
        const { ride, pickupCoords: pu, dropCoords: dr, pickup: p, destination: d, vehicleType, scheduledAt } = incoming
        if (ride?._id) {
            try {
                sessionStorage.setItem(USER_RIDE_SESSION_KEY, String(ride._id))
            } catch { /* ignore */ }
        }
        if (pu) setPickupCoords(pu)
        if (dr) setDropCoords(dr)
        if (p) setPickup(p)
        if (d) setDestination(d)
        if (vehicleType) setVehicleType(vehicleType)
        if (scheduledAt) setScheduledAt(scheduledAt)
        setRide(ride || null)
        keepSearchFirstRef.current = false
        setVehicleFound(true)
        setWaitingForDriver(false)
        try {
            sessionStorage.removeItem(DRAFT_BOOKING_KEY)
        } catch { /* ignore */ }
        navigate(location.pathname, { replace: true })
    }, [ location.state, location.pathname, navigate ])

    return (
        <div className="relative h-full w-full overflow-hidden">
            {/* Full-screen map layer — ONLY behind active booking sheets, never a home background */}
            {!showSearchPanel && (pickupCoords || dropCoords) && (
                <div className="absolute inset-0 z-0">
                    <RideMap
                        pickupCoords={pickupCoords}
                        dropCoords={dropCoords}
                        driverCoords={driverCoords}
                        passengerLiveCoords={passengerCoords}
                        showRoute={!!(pickupCoords && dropCoords)}
                        trackingFrom={trackingDriverToPickup ? driverCoords : null}
                        trackingTo={trackingDriverToPickup ? pickupCoords : null}
                    />
                </div>
            )}

            {/* Foreground: fixed app viewport (no page scroll) — location suggestions render inline in the flow (no overlay) */}
            <div className="relative z-20 mx-auto flex h-full w-full max-w-[430px] flex-col overflow-hidden">
                <RideEasyHeader
                    onNotifications={() => setNotificationsOpen(true)}
                    onSchedule={() => setScheduleOpen(true)}
                />

                {showSearchPanel && (
                    <>
                        <div className="relative shrink-0">
                            <LocationSelector
                                pickup={pickup}
                                destination={destination}
                                onPickupChange={handlePickupChange}
                                onPickupFocus={() => {
                                    setActiveField('pickup')
                                    if (pickup.trim()) runLocationSearch('pickup', pickup)
                                    else {
                                        setSearchStatus('idle')
                                        setDestinationSuggestions([])
                                    }
                                }}
                                onDestinationChange={handleDestinationChange}
                                onDestinationFocus={() => {
                                    setActiveField('destination')
                                    if (destination.trim()) runLocationSearch('destination', destination)
                                    else {
                                        setSearchStatus('idle')
                                        setPickupSuggestions([])
                                    }
                                }}
                                bookingError={bookingError}
                                recents={recentSearches}
                                onSelectRecent={handleSelectRecent}
                                searching={!!activeField}
                                searchStatus={searchStatus}
                                suggestions={activeField === 'pickup' ? pickupSuggestions : destinationSuggestions}
                                onSelectSuggestion={handleSelectSuggestion}
                                onForMeOpen={() => setForMeOpen(true)}
                                onFindTrip={() => findTrip()}
                                canFindTrip={hasRouteSelections}
                                findingTrip={findingTrip}
                            />
                        </div>

                        {(currentUser?.savedAddresses?.home || currentUser?.savedAddresses?.work) && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {currentUser.savedAddresses?.home ? (
                                    <button
                                        type="button"
                                        className="rounded-full border border-theme bg-theme-card px-3 py-1 text-xs font-medium text-theme-primary hover:bg-theme-card-muted"
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
                                        className="rounded-full border border-theme bg-theme-card px-3 py-1 text-xs font-medium text-theme-primary hover:bg-theme-card-muted"
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
                                        className="rounded-full border border-theme bg-theme-card px-3 py-1 text-xs font-medium text-theme-primary hover:bg-theme-card-muted"
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
                                        className="rounded-full border border-theme bg-theme-card px-3 py-1 text-xs font-medium text-theme-primary hover:bg-theme-card-muted"
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

                        <div className="mt-auto shrink-0 pb-2">
                            <SafetyPromoCard />
                        </div>
                    </>
                )}
            </div>

            <ForMeSheet
                open={forMeOpen}
                users={forMeUsers}
                active={forMeActive}
                onClose={() => setForMeOpen(false)}
                onSelect={(name) => {
                    setForMeActive(name)
                    setForMeOpen(false)
                }}
                onAdd={({ name, phone }) => {
                    setForMeUsers((prev) => [ ...prev, { name, phone } ])
                    setForMeActive(name)
                    setForMeOpen(false)
                }}
            />

            <ScheduleModal
                open={scheduleOpen}
                onClose={() => setScheduleOpen(false)}
                onContinue={handleScheduleContinue}
                findingTrip={findingTrip}
            />

            {notificationsOpen && (
                <div className="absolute inset-0 z-[60] flex flex-col justify-end">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
                        onClick={() => setNotificationsOpen(false)}
                        aria-hidden
                    />
                    <div className="relative max-h-[60vh] overflow-y-auto rounded-t-2xl border-t border-theme bg-theme-card p-4 pb-6">
                        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-theme-card-muted" />
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-base font-bold text-theme-primary">{t('notifications')}</h2>
                            <button
                                type="button"
                                onClick={() => setNotificationsOpen(false)}
                                className="rounded-full border border-theme bg-theme-card px-2.5 py-1 text-xs text-theme-secondary active:scale-95"
                            >
                                {t('close')}
                            </button>
                        </div>
                        <div className="rounded-xl border border-theme bg-theme-card p-4 text-center text-sm text-theme-secondary">
                            {t('no_new_notifications')}
                        </div>
                    </div>
                </div>
            )}

            <div ref={vehiclePanelRef} className={`absolute inset-x-0 w-full z-40 bottom-0 bg-theme-card border-t border-theme text-theme-primary px-3 pt-10 pb-20 rounded-t-3xl max-h-[90dvh] flex flex-col overflow-hidden shadow-[0_-8px_40px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-in-out ${(vehiclePanel && !confirmRidePanel) ? 'translate-y-0' : 'translate-y-full'}`}>
                <div className="flex min-h-0 flex-1 flex-col">
                    <VehiclePanel
                        selectedVehicle={vehicleType}
                        onSelectVehicle={handleVehicleTap}
                        onContinue={continueFromVehiclePanel}
                        city={String(serviceCity || 'Kolhapur').toLowerCase()}
                        fare={fare} setConfirmRidePanel={setConfirmRidePanel} setVehiclePanel={setVehiclePanel} />
                </div>
            </div>
            <div ref={confirmRidePanelRef} className={`absolute inset-x-0 w-full z-50 bottom-0 bg-theme-card border-t border-theme text-theme-primary px-3 py-6 pt-12 pb-24 rounded-t-3xl max-h-[92dvh] overflow-y-auto shadow-[0_-8px_40px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-in-out ${confirmRidePanel ? 'translate-y-0' : 'translate-y-full'}`}>
                <ConfirmRide
                    createRide={createRide}
                    pickup={pickup}
                    destination={destination}
                    fare={fare}
                    vehicleType={vehicleType}
                    scheduledAt={scheduledAt}

                    setConfirmRidePanel={setConfirmRidePanel} setVehicleFound={setVehicleFound} />
            </div>
            <div ref={vehicleFoundRef} className={`absolute inset-x-0 w-full z-50 bottom-0 bg-theme-card border-t border-theme text-theme-primary px-3 py-6 pt-12 pb-24 rounded-t-3xl transition-transform duration-300 ease-in-out ${vehicleFound ? 'translate-y-0' : 'translate-y-full'}`}>
                <LookingForDriver
                    createRide={createRide}
                    pickup={pickup}
                    destination={destination}
                    fare={fare}
                    vehicleType={vehicleType}
                    ride={ride}
                    passengerOtp={passengerOtp}
                    assignmentError={assignmentError}
                    setVehicleFound={setVehicleFound}
                    onEditLocations={() => {
                        setVehicleFound(false)
                    }} />
            </div>
            <div ref={waitingForDriverRef} className={`absolute inset-x-0 bottom-0 z-50 flex max-h-[92dvh] w-full flex-col overflow-y-auto rounded-t-3xl border-t border-theme bg-theme-card px-3 pb-24 pt-12 text-theme-primary transition-transform duration-300 ease-in-out [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${waitingForDriver ? 'translate-y-0' : 'translate-y-full'}`}>
                <WaitingForDriver
                    ride={ride}
                    confirmation={rideConfirmation}
                    passengerOtp={passengerOtp}
                    driverCoords={driverCoords}
                    pickupCoords={pickupCoords}
                    dropCoords={dropCoords}
                    setVehicleFound={setVehicleFound}
                    setWaitingForDriver={closeWaitingPanel}
                    waitingForDriver={waitingForDriver} />
            </div>
        </div>
    )
}

export default Home
