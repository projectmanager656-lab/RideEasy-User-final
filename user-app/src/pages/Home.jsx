import React, { useEffect, useRef, useState, useContext, useCallback } from 'react'
import 'remixicon/fonts/remixicon.css'
import { apiClient, withAuth } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { stripApiEnvelope } from '../utils/apiBody'
import { RIDE_ACCEPTED, RIDE_STARTED, RIDE_COMPLETED, LOCATION_UPDATE, NOTIFICATION_NEW } from '../constants/rideSocketEvents'
import { useSocket } from '../hooks/useSocket';
import { UserDataContext } from '../context/UserContext';
import { useNavigate, useLocation } from 'react-router-dom';
import RideEasyHeader from '../components/RideEasyHeader';
import LocationSelector from '../components/LocationSelector';
import ForMeSheet from '../components/ForMeSheet';
import SafetyPromoCard from '../components/SafetyPromoCard';
import rideEasyCity from '../assets/rideeasy-city.png';
import ScheduleModal from '../components/ScheduleModal';
import ScheduledRideConfirmation from '../components/ScheduledRideConfirmation';
import NotificationSheet from '../components/NotificationSheet';
import { SERVICE_AREAS } from '../utils/serviceArea'
import { findRideTier, findTierByBackendType } from '../constants/rideTiers'
import { searchServiceAreaPlaces } from '../constants/serviceAreaPlaces'
import { addRecentSearch, fetchBackendRecentSearches, getRecentSearches } from '../utils/recentSearches'
import { useLanguage } from '../i18n'
const USER_RIDE_SESSION_KEY = 'rideeasy_user_ride'
/** Same search window the tracking screen uses before it declares "No Driver Found". */
const RIDE_SEARCH_TIMEOUT_SECONDS = 120
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

/**
 * THE canonical ride status → screen mapping, shared by the Home active-ride banner and
 * notification clicks. `null` means there is no screen to open (nothing live).
 *
 * `searching`, `accepted` and `arrived` are all owned by the live ride screen
 * (/searching-for-driver): it renders the driver search, the assigned driver's details
 * and the arrival/OTP state of the ride a passenger is actually on. The standalone
 * `/driver-details` and `/user-otp` pages are superseded — nothing in the live ride
 * flow navigates to them, so they must never be a routing target from here.
 */
function rideRouteForStatus(s) {
    const st = normalizeRideStatus(s)
    if (st === 'searching' || st === 'accepted' || st === 'arrived') return '/searching-for-driver'
    if (st === 'started' || st === 'completed') return '/riding'
    /* Reserved or finished: the upcoming/history list owns it. */
    if (st === 'scheduled' || st === 'cancelled') return '/history'
    return null
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
    /** Reserved future booking — shows the scheduled confirmation instead of driver search. */
    const [ scheduledRide, setScheduledRide ] = useState(null)
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
    /** In-app notifications for this passenger (Home bell + sheet). */
    const [ notifications, setNotifications ] = useState([])
    const [ notificationsLoading, setNotificationsLoading ] = useState(false)
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
    /** True after the first socket connect — lets reconnects trigger a notification resync. */
    const sawConnectedRef = useRef(false)

    const navigate = useNavigate()
    const location = useLocation()
    /**
     * True when this Home visit came from a deliberate in-app navigation (the bottom-nav
     * Home tab, the Home icon on the ride screen, a post-ride "Done", …).
     *
     * `location.key` is `'default'` only for the very first location of a page load, so a
     * `true` here means the passenger explicitly asked for Home and must be left there —
     * a live ride is never allowed to bounce them back to the ride screen. Recovery of a
     * live ride still runs on a genuine app entry (reload / reopen / deep link to Home).
     */
    const arrivedByUserActionRef = useRef(location.key !== 'default')
    const chooseRideResult = location.state?.chooseRideResult

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

    /**
     * Recent searches are per account. Whenever the authenticated rider changes, drop
     * whatever the previous account had on screen and reconcile with this account's
     * server list — which is authoritative, so a brand-new account simply stays empty
     * and a returning account gets its own history back.
     */
    const recentSearchesUserId = currentUser?._id ? String(currentUser._id) : ''
    useEffect(() => {
        let cancelled = false
        if (!recentSearchesUserId) {
            /* Signed out: never keep the previous account's list on screen. */
            setRecentSearches([])
            return () => { cancelled = true }
        }
        setRecentSearches(getRecentSearches())
        fetchBackendRecentSearches().then((list) => {
            if (!cancelled) setRecentSearches(Array.isArray(list) ? list : [])
        })
        return () => { cancelled = true }
    }, [recentSearchesUserId])

    useEffect(() => {
        if (!socket || !currentUser?._id) return;
        const uid = String(currentUser._id);
        const emitJoin = () => {
            console.info('[socket] registering as passenger', { userId: uid });
            socket.emit('join', { userType: 'user', userId: uid });
        };
        emitJoin();
        /**
         * Re-join after a reconnect. Every socket frame sent while the client was
         * disconnected is gone for good (room emits are not buffered), so also
         * resync the notification list once — otherwise a dispatch that landed during
         * a drop would leave the badge and the sheet stale. One fetch per reconnect.
         */
        const onConnect = () => {
            emitJoin();
            if (sawConnectedRef.current) void loadNotificationsRef.current?.();
            sawConnectedRef.current = true;
        };
        socket.on('connect', onConnect);
        return () => {
            socket.off('connect', onConnect);
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
        if (chooseRideResult) return
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
            /**
             * Live / completed ride. Only a genuine app entry (reload, reopen, deep link
             * straight to Home) may open the ride screen; a passenger who deliberately
             * navigated to Home mid-ride stays here and re-enters through the active-ride
             * banner. Either way the ride itself is untouched — it keeps running.
             */
            if (st === 'started' || st === 'completed') {
                if (!arrivedByUserActionRef.current) {
                    navigate('/riding', {
                        replace: true,
                        state: { ride: { ...data, status: st } },
                    })
                    return
                }
                if (st === 'completed') {
                    /* Nothing left to resume — drop the stale session pointer. */
                    try { sessionStorage.removeItem(USER_RIDE_SESSION_KEY) } catch { /* ignore */ }
                    return
                }
                /* Live ride, passenger chose Home: keep it loaded for the banner. */
                resumedRideFromSessionRef.current = true
                setVehicleFound(false)
                setWaitingForDriver(false)
                return
            }
            /* A search that already ran past the window is dead. Resurrecting it makes
               Home bounce the rider straight into the "No Driver Found" modal — e.g.
               right after tapping "Where to go?" from the location screen. */
            if (st === 'searching') {
                /** Measure from when the search actually began (dispatch), not row creation. */
                const baseMs = data.searchStartedAt
                    ? new Date(data.searchStartedAt).getTime()
                    : (data.createdAt ? new Date(data.createdAt).getTime() : NaN)
                const expiredSearch = Number.isFinite(baseMs)
                    && (Date.now() - baseMs) / 1000 >= RIDE_SEARCH_TIMEOUT_SECONDS
                if (expiredSearch) {
                    try { sessionStorage.removeItem(USER_RIDE_SESSION_KEY) } catch { /* ignore */ }
                    return
                }
            }
            if (![ 'scheduled', 'searching', 'accepted', 'arrived' ].includes(st)) {
                try { sessionStorage.removeItem(USER_RIDE_SESSION_KEY) } catch { /* ignore */ }
                return
            }
            /**
             * A scheduled booking the backend has already started is the passenger's
             * live ride — enter the existing searching flow. Book Now keeps its current
             * behaviour of staying on Home until the user resumes it.
             */
            if (st !== 'scheduled' && data.bookingType === 'scheduled') {
                navigate('/searching-for-driver', {
                    replace: true,
                    state: { ride: { ...data, status: st } },
                })
                return
            }
            resumedRideFromSessionRef.current = true
            setVehicleFound(false)
            setWaitingForDriver(false)
        })
    }, [ride, currentUser?._id, syncRideFromServer, navigate, chooseRideResult])

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
                    /**
                     * A reserved scheduled booking the backend has just activated.
                     * Deliberately does NOT force navigation: the passenger enters
                     * through the Home notification ("Searching for your driver"), and
                     * that click recovers the authoritative ride before navigating.
                     * We only drop the reservation screen and keep ride state fresh.
                     */
                    if (data.dispatchedFrom === 'scheduled') {
                        setScheduledRide(null)
                        /**
                         * Safety net for the notification list: if the separate
                         * `notification:new` frame was missed (socket reconnect), this
                         * one-shot refetch still surfaces "Searching for your driver"
                         * and updates the unread badge. One fetch per dispatch — no polling.
                         */
                        void loadNotificationsRef.current?.()
                    }
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
                       from the Live tab via the session key. A passenger who
                       deliberately opened Home mid-ride is likewise left alone;
                       the active-ride banner is the way back in. */
                    if (!arrivedByUserActionRef.current
                        && (!keepSearchFirstRef.current || resumedRideFromSessionRef.current)) {
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

        /** Realtime in-app notification (e.g. scheduled ride activated). */
        const handleNotificationNew = (payload) => {
            if (!payload?._id) return
            setNotifications((prev) => (
                prev.some((n) => String(n._id) === String(payload._id))
                    ? prev
                    : [ payload, ...prev ]
            ))
        }
        socket.on(NOTIFICATION_NEW, handleNotificationNew)

        return () => {
            socket.off(RIDE_ACCEPTED, handleRideAccepted)
            socket.off(LOCATION_UPDATE, handleLocationUpdate)
            socket.off(RIDE_STARTED, handleRideStarted)
            socket.off(RIDE_COMPLETED, handleRideCompletedEvt)
            socket.off('ride:status-update', handleStatusUpdate)
            socket.off(NOTIFICATION_NEW, handleNotificationNew)
        }
    }, [socket, navigate, syncRideFromServer]);

    /** Authoritative read of this passenger's in-app notifications. */
    const loadNotifications = useCallback(async () => {
        const token = localStorage.getItem('token')
        if (!token) return
        setNotificationsLoading(true)
        try {
            const res = await apiClient.get('/users/notifications', withAuth())
            const body = stripApiEnvelope(res.data)
            if (Array.isArray(body?.notifications)) setNotifications(body.notifications)
        } catch { /* notifications are non-critical */ } finally {
            setNotificationsLoading(false)
        }
    }, [])

    /** Lets the socket handler (defined earlier) trigger a one-shot refetch. */
    const loadNotificationsRef = useRef(null)
    loadNotificationsRef.current = loadNotifications

    useEffect(() => {
        if (!currentUser?._id) return
        void loadNotifications()
    }, [loadNotifications, currentUser?._id])

    /** Reconcile whenever the sheet is opened. */
    useEffect(() => {
        if (notificationsOpen) void loadNotifications()
    }, [notificationsOpen, loadNotifications])

    /** Mark one notification read (server-authoritative, optimistic locally). */
    const markNotificationRead = useCallback(async (id) => {
        if (!id) return
        setNotifications((prev) => prev.map((n) => (
            String(n._id) === String(id) ? { ...n, isRead: true } : n
        )))
        try {
            await apiClient.post(`/users/notifications/${id}/read`, {}, withAuth())
        } catch { /* next load reconciles */ }
    }, [])

    /**
     * Notification click → recover the CURRENT ride from the backend and route by
     * its LIVE status. The status stored on the notification may be stale.
     */
    const openNotification = useCallback(async (n) => {
        setNotificationsOpen(false)
        void markNotificationRead(n?._id)
        const rideId = n?.meta?.rideId
        if (!rideId) return
        const data = await syncRideFromServer(rideId)
        const st = normalizeRideStatus(data?.status)
        const dest = rideRouteForStatus(st)
        if (!dest) return undefined
        return navigate(dest, { state: { ride: { ...(data || { _id: rideId }), status: st || data?.status } } })
    }, [markNotificationRead, navigate, syncRideFromServer]);

    /**
     * Active-ride banner → recover the CURRENT ride and open the screen that owns its
     * live status. State may have advanced since the last render, so the status is
     * re-read from the backend first. This is the passenger's deliberate way back into
     * a ride from Home.
     */
    const openActiveRide = useCallback(async () => {
        const rideId = ride?._id
        if (!rideId) return
        const data = await syncRideFromServer(rideId)
        const st = normalizeRideStatus(data?.status || ride?.status)
        /* Cancelled mid-flight: there is nothing live left to open. */
        if (st === 'cancelled') {
            setRide(null)
            return
        }
        const dest = rideRouteForStatus(st)
        if (!dest) return
        navigate(dest, {
            state: {
                ride: { ...(data || ride || {}), status: st },
                pickupCoords,
                dropCoords,
                pickup,
                destination,
                passengerOtp,
                confirmation: rideConfirmation,
                vehicleType: ride?.vehicleType,
                tierId: ride?.tierId,
                price: ride?.price,
                paymentMethod: ride?.paymentMethod,
            },
        })
    }, [ ride, pickupCoords, dropCoords, pickup, destination, passengerOtp, rideConfirmation, syncRideFromServer, navigate ]);

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

    /**
     * Search expiry on Home. The tracking screen owns the "No Driver Found" modal, but
     * the rider can come back here while a search is still running — without this the
     * ride stays `searching` forever, the top banner never clears and the search hangs.
     * Hand off to the tracking screen, which cancels the ride and shows the modal.
     *
     * A passenger who deliberately opened Home stays here — the active-ride banner is
     * their way back into the search, the same rule the started/completed handoffs use.
     * Only a genuine app entry (reload / reopen / deep link to Home) keeps the handoff.
     */
    useEffect(() => {
        if (rideStatus !== 'searching' || !ride?._id) return
        if (arrivedByUserActionRef.current) return
        const openSearchOutcome = () => {
            navigate('/searching-for-driver', { replace: true, state: { ride } })
        }
        const startedMs = ride?.createdAt ? new Date(ride.createdAt).getTime() : NaN
        const elapsedSec = Number.isFinite(startedMs)
            ? Math.max(0, Math.floor((Date.now() - startedMs) / 1000))
            : 0
        const remainingMs = Math.max(0, (RIDE_SEARCH_TIMEOUT_SECONDS - elapsedSec) * 1000)
        if (remainingMs === 0) {
            openSearchOutcome()
            return
        }
        const id = setTimeout(openSearchOutcome, remainingMs)
        return () => clearTimeout(id)
    }, [ride, rideStatus, navigate]);


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

    /**
     * Recent search → booking fields. Restores BOTH pickup and drop locations
     * from the recent search record, populating the input fields and resolving coordinates.
     */
    const applyRecentLocation = async (item) => {
        if (!item) return

        const from = String(
            (typeof item.pickup === 'object' && item.pickup !== null ? item.pickup.name || item.pickup.address : item.pickup) || ''
        ).trim()
        const to = String(
            (typeof item.destination === 'object' && item.destination !== null ? item.destination.name || item.destination.address : '')
            || (typeof item.drop === 'object' && item.drop !== null ? item.drop.name || item.drop.address : '')
            || item.destination
            || item.drop
            || item.name
            || ''
        ).trim()

        if (!from && !to) return

        chooseRideSentRef.current = false
        setBookingError('')
        clearTimeout(searchTimerRef.current)
        setActiveField(null)
        setPickupSuggestions([])
        setDestinationSuggestions([])
        setSearchStatus('idle')

        // When both pickup and drop exist in the recent search record, restore both together
        if (from && to) {
            setPickup(from)
            setDestination(to)

            let pCoords = item.pickupCoords || (item.pickup?.latitude != null && item.pickup?.longitude != null ? { lat: item.pickup.latitude, lng: item.pickup.longitude } : null)
            let pSelection = item.pickupSelection || (typeof item.pickup === 'object' && item.pickup !== null ? item.pickup : null)

            let dCoords = item.dropCoords || (item.drop?.latitude != null && item.drop?.longitude != null ? { lat: item.drop.latitude, lng: item.drop.longitude } : null)
            let dSelection = item.dropSelection || (typeof item.destination === 'object' && item.destination !== null ? item.destination : (typeof item.drop === 'object' && item.drop !== null ? item.drop : null))

            const [ fetchedPick, fetchedDrop ] = await Promise.all([
                (!pCoords || !pSelection) ? fetchPickupCoords(from) : Promise.resolve(null),
                (!dCoords || !dSelection) ? fetchDropCoords(to) : Promise.resolve(null),
            ])

            if (fetchedPick) {
                pCoords = fetchedPick
                pSelection = { name: from, latitude: fetchedPick.lat, longitude: fetchedPick.lng }
            }
            if (fetchedDrop) {
                dCoords = fetchedDrop
                dSelection = { name: to, latitude: fetchedDrop.lat, longitude: fetchedDrop.lng }
            }

            if (pCoords && pSelection) {
                setPickupCoords(pCoords)
                setPickupSelection(pSelection)
            } else {
                setPickupCoords(null)
                setPickupSelection(null)
                setBookingError(t('could_not_resolve_pickup'))
            }

            if (dCoords && dSelection) {
                setDropCoords(dCoords)
                setDropSelection(dSelection)
            } else {
                setDropCoords(null)
                setDropSelection(null)
                setBookingError(t('could_not_resolve_drop'))
            }

            addRecentSearch({
                pickup: from,
                destination: to,
                pickupCoords: pCoords,
                dropCoords: dCoords,
                pickupSelection: pSelection,
                dropSelection: dSelection,
            })
            setRecentSearches(getRecentSearches())
            return
        }

        // Single location fallback (if a legacy item has only destination or only pickup)
        const singlePlace = to || from
        const pickupEmpty = !String(pickup || '').trim()
        if (pickupEmpty) {
            setPickup(singlePlace)
            const pc = await fetchPickupCoords(singlePlace)
            if (pc) {
                setPickupCoords(pc)
                setPickupSelection({ name: singlePlace, latitude: pc.lat, longitude: pc.lng })
            } else {
                setPickupCoords(null)
                setPickupSelection(null)
                setBookingError(t('could_not_resolve_locations'))
            }
        } else {
            setDestination(singlePlace)
            const dc = await fetchDropCoords(singlePlace)
            if (dc) {
                setDropCoords(dc)
                setDropSelection({ name: singlePlace, latitude: dc.lat, longitude: dc.lng })
            } else {
                setDropCoords(null)
                setDropSelection(null)
                setBookingError(t('could_not_resolve_locations'))
            }
        }
    }

    const handleSelectRecent = (item) => { void applyRecentLocation(item) }

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
            const sel = { name, latitude: coords.lat, longitude: coords.lng }
            setDropCoords(coords)
            setDropSelection(sel)
            addRecentSearch({
                pickup: pickup?.trim() || '',
                destination: name,
                detail: typeof suggestion === 'object' && suggestion?.description ? suggestion.description : '',
                pickupCoords,
                dropCoords: coords,
                pickupSelection,
                dropSelection: sel,
            })
            setRecentSearches(getRecentSearches())
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
    const ridePickupLng = ride?.pickup?.coordinates?.[0]
    const ridePickupLat = ride?.pickup?.coordinates?.[1]
    const rideDropLng = ride?.drop?.coordinates?.[0]
    const rideDropLat = ride?.drop?.coordinates?.[1]
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

        const hasPickupCoordinates = ridePickupLng != null && ridePickupLat != null
        if (hasPickupCoordinates) {
            setPickupCoords((prev) => prev || { lat: ridePickupLat, lng: ridePickupLng })
        } else if (pu) {
            const gk = `${ride._id}:pick:${pu}`
            if (rideGeocodeOnceRef.current.pick !== gk) {
                rideGeocodeOnceRef.current.pick = gk
                fetchPickupCoords(pu)
            }
        }
        const hasDropCoordinates = rideDropLng != null && rideDropLat != null
        if (hasDropCoordinates) {
            setDropCoords((prev) => prev || { lat: rideDropLat, lng: rideDropLng })
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
        ridePickupLng,
        ridePickupLat,
        rideDropLng,
        rideDropLat,
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
                /** Absolute instant (UTC) so the backend never guesses a timezone. */
                ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {})
            }, withAuth())
            const raw = stripApiEnvelope(response.data)
            const ridePayload = { ...(raw?.ride && typeof raw.ride === 'object' ? raw.ride : raw) }
            delete ridePayload.otp
            /**
             * SCHEDULED booking: reserved only. Leave the searching state and show the
             * confirmation — the backend dispatcher starts the driver search later.
             */
            if (ridePayload?.status === 'scheduled' || raw?.scheduled === true) {
                setVehicleFound(false)
                setWaitingForDriver(false)
                setConfirmRidePanel(false)
                setVehiclePanel(false)
                setRide(null)
                setScheduledRide(ridePayload)
                if (ridePayload?._id) {
                    try {
                        sessionStorage.setItem(USER_RIDE_SESSION_KEY, String(ridePayload._id))
                    } catch { /* ignore */ }
                }
                return ridePayload
            }
            setRide(ridePayload)
            setPassengerOtp('')
            setDriverCoords(null)
            if (pickup?.trim() || destination?.trim()) {
                addRecentSearch({
                    pickup,
                    destination,
                    pickupCoords,
                    dropCoords,
                    pickupSelection,
                    dropSelection,
                })
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
        if (chooseRideResult) return
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
    }, [ ride?._id, chooseRideResult ])

    /** Handoff from the Choose Ride screen: open the existing "Looking for driver" state. */
    const chooseRideConsumedRef = useRef(false)
    useEffect(() => {
        const incoming = chooseRideResult
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
    }, [ chooseRideResult, location.pathname, navigate ])

    /** Latest applyRecentLocation — lets the handoff effect below keep stable deps. */
    const applyRecentLocationRef = useRef(applyRecentLocation)
    useEffect(() => {
        applyRecentLocationRef.current = applyRecentLocation
    })

    /** Handoff from the Location screen: the tapped recent search fills the first empty field. */
    const recentFromLocationRef = useRef(false)
    useEffect(() => {
        const incoming = location.state?.recentLocation
        if (!incoming || recentFromLocationRef.current) return
        recentFromLocationRef.current = true
        navigate(location.pathname, { replace: true })
        void applyRecentLocationRef.current(incoming)
    }, [ location.state, location.pathname, navigate ])

    const activeRideStatus = normalizeRideStatus(ride?.status)
    /** SEARCHING / ACCEPTED / ARRIVED / started (ongoing ride). Everything else — cancelled,
     *  completed, or a failed search — leaves the banner hidden. */
    const hasActiveRide = activeRideStatus === 'searching'
        || activeRideStatus === 'accepted'
        || activeRideStatus === 'arrived'
        || activeRideStatus === 'started'

    /** Drives the bell badge; kept in sync by the socket event and by each load. */
    const unreadNotificationCount = notifications.filter((n) => !n.isRead).length

    /** Reserved future booking — confirm it instead of showing any driver-searching UI. */
    if (scheduledRide) {
        return (
            <ScheduledRideConfirmation
                ride={scheduledRide}
                pickup={pickup}
                destination={destination}
                vehicleType={scheduledRide.vehicleType || vehicleType}
                onDone={() => { setScheduledRide(null); navigate('/home', { replace: true }) }}
                onViewTrips={() => { setScheduledRide(null); navigate('/history', { replace: true }) }}
            />
        )
    }

    return (
        <div className={`relative h-full w-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden bg-theme-bg text-theme-primary${notificationsOpen ? ' overflow-hidden' : ''}`}>
            <div className="relative z-20 mx-auto flex min-h-full w-full max-w-[430px] flex-col pb-0">
                <RideEasyHeader
                    onBack={() => navigate('/location', { replace: true })}
                    onNotifications={() => setNotificationsOpen(true)}
                    notificationCount={unreadNotificationCount}
                    onSchedule={() => setScheduleOpen(true)}
                />

                {/* Active Ride Banner if user has an active ride in progress */}
                {hasActiveRide && (
                    <div className="mx-4 mb-3 flex items-center justify-between rounded-2xl border border-brand-yellow/50 bg-brand-yellow/10 p-3 shadow-sm">
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-yellow text-black font-bold shadow">
                                <i className={activeRideStatus === 'searching' ? 'ri-search-line animate-spin' : 'ri-roadster-fill'} />
                            </span>
                            <div>
                                <p className="text-xs font-bold text-theme-primary">
                                    {activeRideStatus === 'searching'
                                        ? t('looking_for_driver')
                                        : activeRideStatus === 'arrived'
                                            ? t('driver_has_arrived')
                                            : activeRideStatus === 'started'
                                                ? (t('live_ride_in_progress') || 'Live Ride in Progress')
                                                : t('driver_assigned_track')}
                                </p>
                                <p className="text-[11px] text-theme-secondary">
                                    {activeRideStatus === 'searching'
                                        ? t('connecting_with_nearby_driver')
                                        : activeRideStatus === 'started'
                                            ? (ride?.captain?.name
                                                ? t('driver_on_the_way', { driverName: ride.captain.name })
                                                : (destination || t('driver_assigned_track')))
                                            : (ride?.captain?.name ? `${ride.captain.name} • ${ride.captain.vehicleNumber || ''}` : (t('tap_to_view_details') || 'Tap to view details'))}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => { void openActiveRide() }}
                            className="flex items-center gap-1 rounded-xl bg-brand-yellow px-3 py-1.5 text-xs font-bold text-black transition active:scale-95 shadow"
                        >
                            <span>{t('tracking') || 'Track'}</span>
                            <i className="ri-arrow-right-line text-xs" />
                        </button>
                    </div>
                )}

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
                        rideFor={forMeActive}
                        onFindTrip={() => findTrip()}
                        canFindTrip={hasRouteSelections}
                        findingTrip={findingTrip}
                    />
                </div>

                {(currentUser?.savedAddresses?.home || currentUser?.savedAddresses?.work) && (
                    <div className="mt-3 flex flex-wrap gap-2 px-4">
                        {currentUser.savedAddresses?.home ? (
                            <button
                                type="button"
                                className="rounded-full border border-theme bg-theme-card px-3 py-1 text-xs font-medium text-theme-primary hover:bg-theme-card-muted transition"
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
                                className="rounded-full border border-theme bg-theme-card px-3 py-1 text-xs font-medium text-theme-primary hover:bg-theme-card-muted transition"
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
                                className="rounded-full border border-theme bg-theme-card px-3 py-1 text-xs font-medium text-theme-primary hover:bg-theme-card-muted transition"
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
                                className="rounded-full border border-theme bg-theme-card px-3 py-1 text-xs font-medium text-theme-primary hover:bg-theme-card-muted transition"
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

                <div className="mt-4 shrink-0 pb-2">
                    <SafetyPromoCard />
                </div>

                <div className="mt-0 w-full shrink-0 pb-0">
                    <div className="relative overflow-hidden rounded-2xl">
                        <div className="absolute left-5 top-5 z-10">
                            <div className="text-xl font-extrabold leading-tight">
                                <span style={{color: '#000000'}}>Ride</span><span style={{color: '#FACC15'}}> Easy</span>
                            </div>
                            <div className="mt-1 text-sm font-bold leading-tight text-black">
                                Ride Anywhere, Any Time
                            </div>
                        </div>
                        <img
                            src={rideEasyCity}
                            alt="RideEasy city"
                            className="block h-auto w-full object-cover"
                        />
                    </div>
                </div>
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

            <NotificationSheet
                open={notificationsOpen}
                onClose={() => setNotificationsOpen(false)}
                notifications={notifications}
                loading={notificationsLoading}
                onSelect={openNotification}
            />
        </div>
    )
}

export default Home