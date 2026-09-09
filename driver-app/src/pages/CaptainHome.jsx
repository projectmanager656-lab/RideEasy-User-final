import React, { useRef, useState, useEffect, useContext, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import CaptainDetails from '../components/CaptainDetails'
import RidePopUp from '../components/RidePopUp'
import ConfirmRidePopUp from '../components/ConfirmRidePopUp'
import DriverAcceptSuccessModal from '../components/DriverAcceptSuccessModal'
import { useSocket } from '../hooks/useSocket'
import { CaptainDataContext } from '../context/CaptainContext'
import LiveTracking from '../components/LiveTracking'
import RideMap from '../components/RideMap'
import { apiClient, withCaptainAuth } from '../services/http'
import { driverBackendJson } from '../services/driverBackendFetch'
import { RIDE_REQUEST, RIDE_COMPLETED, LOCATION_UPDATE } from '../constants/rideSocketEvents'
import { stripApiEnvelope } from '../utils/apiBody'
import { useDriverLocationSocket } from '../hooks/useDriverLocationSocket'
import { ridePickupInServiceArea, fallbackCoordsForCaptainCity } from '../utils/serviceArea'
import { useLanguage } from '../i18n'

const LOCATION_EMIT_MS = 2000
const PENDING_POLL_MS = 4000
const LAST_COMPLETED_KEY = 'rideeasy_driver_last_completed_ride'

function geoErrorMessage (err, t) {
  if (!err) return t('location_unavailable')
  const code = err.code
  if (code === 1) return t('location_permission_denied_full')
  if (code === 2) return t('location_unavailable_signal')
  if (code === 3) return t('location_request_timed_out')
  return err.message || t('location_error')
}

const CaptainHome = () => {
    const { t } = useLanguage()
    const [ ridePopupPanel, setRidePopupPanel ] = useState(false)
    const [ confirmRidePopupPanel, setConfirmRidePopupPanel ] = useState(false)
    const [ acceptSuccessOpen, setAcceptSuccessOpen ] = useState(false)
    const [, setPendingRides ] = useState([])
    const [ subscriptionStatus, setSubscriptionStatus ] = useState(null)
    const [ geoError, setGeoError ] = useState('')
    const ridePopupPanelRef = useRef(null)
    const confirmRidePopupPanelRef = useRef(null)
    const [ ride, setRide ] = useState(null)
    const [ passengerLiveCoords, setPassengerLiveCoords ] = useState(null)
    const [ captainGps, setCaptainGps ] = useState(null)
    const activeRideIdRef = useRef(null)
    /** Completed ride ids — block stale socket + pending poll from resurrecting this ride. */
    const completedRideIdsRef = useRef(new Set())
    /** User minimized panel or rejected — only block pending poll (fresh socket can still show same ride). */
    const pollSuppressedRideIdsRef = useRef(new Set())
    const socket = useSocket()
    const { captain } = useContext(CaptainDataContext)

    const ridePopupOpenRef = useRef(false)
    const confirmRideOpenRef = useRef(false)
    const acceptSuccessOpenRef = useRef(false)
    const captainOnlineRef = useRef(false)
    ridePopupOpenRef.current = ridePopupPanel
    confirmRideOpenRef.current = confirmRidePopupPanel
    acceptSuccessOpenRef.current = acceptSuccessOpen
    activeRideIdRef.current = ride?._id != null ? String(ride._id) : null
    captainOnlineRef.current = captain?.status === 'active'

    const onlineEmit = captain?.status === 'active' && captain?._id != null
    const subscriptionReminders = Array.isArray(subscriptionStatus?.reminders) ? subscriptionStatus.reminders : []
    const isPlanExpired = subscriptionStatus?.active === false

    useEffect(() => {
        try {
            const last = sessionStorage.getItem(LAST_COMPLETED_KEY)
            if (last) {
                completedRideIdsRef.current.add(String(last))
                sessionStorage.removeItem(LAST_COMPLETED_KEY)
            }
        } catch { /* ignore */ }
    }, [])

    const dismissIncomingRequest = useCallback(() => {
        const id = ride?._id != null ? String(ride._id) : ''
        if (id) pollSuppressedRideIdsRef.current.add(id)
        setRidePopupPanel(false)
        setRide(null)
    }, [ride?._id])

    useDriverLocationSocket(socket, captain?._id, {
        enabled: onlineEmit,
        intervalMs: LOCATION_EMIT_MS,
        onPosition: (loc) => {
            if (activeRideIdRef.current) setCaptainGps(loc)
        },
        onGeoError: (err) => setGeoError(err ? geoErrorMessage(err, t) : ''),
    })

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
        }
    }, [ ride?._id ])

    useEffect(() => {
        if (!ride?._id || onlineEmit) return
        if (!navigator.geolocation) return
        const id = navigator.geolocation.watchPosition(
            (p) => setCaptainGps({ lat: p.coords.latitude, lng: p.coords.longitude }),
            (err) => setGeoError(geoErrorMessage(err, t)),
            { enableHighAccuracy: true, maximumAge: 10_000 }
        )
        return () => navigator.geolocation.clearWatch(id)
    }, [ ride?._id, onlineEmit, t ])

    useEffect(() => {
        if (!socket || !captain?._id) return
        const capId = String(captain._id)
        const online = captain?.status === 'active'

        if (!online) {
            return undefined
        }

        const city = captain.city || 'Kolhapur'
        const fallback = fallbackCoordsForCaptainCity(city)

        const doJoin = () => {
            socket.emit('join', { userId: capId, userType: 'captain' })
            if (navigator.geolocation) {
                const emitJoin = (lat, lng) => {
                    socket.emit('join-driver', {
                        driverId: capId,
                        city,
                        lat,
                        lng,
                    })
                }
                navigator.geolocation.getCurrentPosition(
                    (pos) => emitJoin(pos.coords.latitude, pos.coords.longitude),
                    () => {
                        navigator.geolocation.getCurrentPosition(
                            (pos) => emitJoin(pos.coords.latitude, pos.coords.longitude),
                            () => emitJoin(fallback.lat, fallback.lng),
                            { enableHighAccuracy: false, maximumAge: 300000, timeout: 20000 }
                        )
                    },
                    { enableHighAccuracy: false, maximumAge: 120000, timeout: 20000 }
                )
            } else {
                socket.emit('join-driver', { driverId: capId, city, lat: fallback.lat, lng: fallback.lng })
            }
        }
        doJoin()
        socket.on('connect', doJoin)
        const fetchPending = () => apiClient
            .get('/rides/pending', {
                ...withCaptainAuth(),
                params: { _ts: Date.now() },
            })
            .then((res) => {
                const raw = Array.isArray(res.data) ? res.data : []
                const list = raw.filter(ridePickupInServiceArea)
                setPendingRides(list)
                const pick = list.find((r) => {
                    const id = r?._id != null ? String(r._id) : ''
                    if (!id) return false
                    if (completedRideIdsRef.current.has(id)) return false
                    if (pollSuppressedRideIdsRef.current.has(id)) return false
                    return true
                })
                if (!ridePopupOpenRef.current && !confirmRideOpenRef.current && !acceptSuccessOpenRef.current && pick) {
                    setRide(pick)
                    setRidePopupPanel(true)
                }
            })
            .catch(() => setPendingRides([]))
        fetchPending()
        const bootFetch = setTimeout(fetchPending, 300)
        socket.on('connect', fetchPending)
        driverBackendJson('/driver-subscriptions/my-status')
            .then((res) => setSubscriptionStatus(res))
            .catch(() => setSubscriptionStatus({ active: false }))
        const pendingInterval = setInterval(fetchPending, PENDING_POLL_MS)

        return () => {
            socket.off('connect', doJoin)
            socket.off('connect', fetchPending)
            clearTimeout(bootFetch)
            clearInterval(pendingInterval)
        }
    }, [ captain?._id, captain?.city, captain?.status, socket ])

    useEffect(() => {
        if (!socket) return

        const handleNewRide = (data) => {
            if (import.meta.env.DEV) {
                const id = data?.ride?._id ?? data?._id
                if (id) console.debug('[RideEasy driver] new-ride event', String(id))
            }
            if (captainOnlineRef.current !== true) return
            if (confirmRideOpenRef.current || acceptSuccessOpenRef.current) return
            const r = data?.ride || data
            if (!r || !(r._id || r.id)) return
            if (!ridePickupInServiceArea(r)) return
            const idStr = String(r._id ?? r.id)
            if (completedRideIdsRef.current.has(idStr)) return
            const st = String(r.status || 'searching').trim().toLowerCase()
            if (st !== 'searching') return
            const cap = r.captain
            if (cap && (cap._id || (typeof cap === 'string' && cap.length > 0))) return
            pollSuppressedRideIdsRef.current.delete(idStr)
            setRide(r)
            setAcceptSuccessOpen(false)
            setRidePopupPanel(true)
        }

        /** Remember completed ride ids so pending poll / stale sockets cannot resurrect them; clear panels if that ride is on screen. */
        const clearUiIfSameRide = (rideIdStr) => {
            const rid = rideIdStr || ''
            if (!rid) return
            completedRideIdsRef.current.add(rid)
            pollSuppressedRideIdsRef.current.delete(rid)
            const current = activeRideIdRef.current || ''
            if (current && rid === current) {
                setConfirmRidePopupPanel(false)
                setRidePopupPanel(false)
                setAcceptSuccessOpen(false)
                setRide(null)
            }
        }

        const handleRideCompletedSocket = (payload) => {
            const rid = payload?.rideId != null ? String(payload.rideId) : ''
            if (!rid) return
            clearUiIfSameRide(rid)
        }

        const handlePassengerGps = (payload) => {
            if (payload?.source !== 'passenger') return
            const rid = payload?.rideId != null ? String(payload.rideId) : ''
            const current = activeRideIdRef.current || ''
            if (!rid || !current || rid !== current) return
            if (payload?.lat == null || payload?.lng == null) return
            setPassengerLiveCoords({ lat: Number(payload.lat), lng: Number(payload.lng) })
        }

        const handleRideStatusUpdate = (data) => {
            if (!data) return
            const st = String(data.status || '').toLowerCase()
            if (st === 'completed') {
                const rid = data.rideId != null ? String(data.rideId) : ''
                if (rid) clearUiIfSameRide(rid)
                return
            }
            if (!data?.catchUp || !data?.ride) return
            if (!ridePickupInServiceArea(data.ride)) return
            const stCatch = String(data.status || '').toLowerCase()
            if (stCatch !== 'accepted' && stCatch !== 'arrived') return
            setRide(data.ride)
            setRidePopupPanel(false)
            setConfirmRidePopupPanel(true)
        }

        socket.on(RIDE_REQUEST, handleNewRide)
        socket.on(RIDE_COMPLETED, handleRideCompletedSocket)
        socket.on(LOCATION_UPDATE, handlePassengerGps)
        socket.on('ride:status-update', handleRideStatusUpdate)

        return () => {
            socket.off(RIDE_REQUEST, handleNewRide)
            socket.off(RIDE_COMPLETED, handleRideCompletedSocket)
            socket.off(LOCATION_UPDATE, handlePassengerGps)
            socket.off('ride:status-update', handleRideStatusUpdate)
        }
    }, [ socket, captain?.status ])

    useEffect(() => {
        captainOnlineRef.current = captain?.status === 'active'
    }, [ captain?.status ])

    function proceedToConfirmRidePanel () {
        setAcceptSuccessOpen(false)
        window.setTimeout(() => setConfirmRidePopupPanel(true), 220)
    }

    async function confirmRide() {
        if (!ride?._id) return
        const capId = captain?._id != null ? String(captain._id) : ''
        const acceptId = String(ride._id)
        try {
            pollSuppressedRideIdsRef.current.delete(acceptId)
            const res = await apiClient.patch(`/rides/${ride._id}/accept`, {}, withCaptainAuth())
            setRide(stripApiEnvelope(res.data))
            setRidePopupPanel(false)
            setConfirmRidePopupPanel(false)
            setAcceptSuccessOpen(true)
        } catch (err) {
            if (err.response?.status === 409) {
                try {
                    const r = await apiClient.get(`/rides/${ride._id}`, withCaptainAuth())
                    const data = stripApiEnvelope(r.data)
                    const assigned = data.captain != null
                        ? String(data.captain._id ?? data.captain)
                        : ''
                    const st = String(data.status || '').toLowerCase()
                    const mine = capId && assigned === capId
                    if (mine && [ 'accepted', 'arrived', 'started' ].includes(st)) {
                        setRide(data)
                        setRidePopupPanel(false)
                        setConfirmRidePopupPanel(false)
                        setAcceptSuccessOpen(true)
                        return
                    }
                    if (assigned && assigned !== capId) {
                        alert(t('ride_taken_by_another_driver'))
                        setRide(null)
                        setRidePopupPanel(false)
                        return
                    }
                } catch { /* fall through */ }
            }
            alert(err.response?.data?.message || err.message || t('failed_to_accept_ride'))
            setRidePopupPanel(false)
        }
    }

    async function rejectRide() {
        if (!ride?._id) return
        pollSuppressedRideIdsRef.current.add(String(ride._id))
        try {
            await apiClient.patch(`/rides/${ride._id}/reject`, {}, withCaptainAuth())
            setRidePopupPanel(false)
            setAcceptSuccessOpen(false)
            setRide(null)
        } catch (err) {
            alert(err.response?.data?.message || err.message || t('reject_failed'))
        }
    }


    // Replaced GSAP with Tailwind transitions for better reliability.

    return (
        <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-black text-white">
            <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6 border-b border-zinc-800">
                <div>
                    <p className="text-xs uppercase tracking-wide text-zinc-500">{t('driver')}</p>
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-lg font-semibold sm:text-xl">{t('dashboard')}</h1>
                        {captain?.status === 'active' ? (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                                {t('online')}
                            </span>
                        ) : (
                            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                                {t('offline')}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <Link
                        to="/history"
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                        aria-label={t('trip_history')}
                    >
                        <i className="text-lg ri-history-line" />
                    </Link>
                    <Link
                        to="/captain/logout"
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                        aria-label={t('logout')}
                    >
                        <i className="text-lg ri-logout-box-r-line" />
                    </Link>
                </div>
            </header>

            {geoError ? (
                <div role="alert" className="shrink-0 border-b border-amber-800 bg-amber-950/80 px-4 py-2 text-xs text-amber-100 sm:px-6">
                    {geoError}
                </div>
            ) : null}
            {subscriptionReminders.length > 0 ? (
                <div className="shrink-0 border-b border-amber-800 bg-amber-950/80 px-4 py-2 text-xs text-amber-100 sm:px-6">
                    {subscriptionReminders.map((r, idx) => (
                        <p key={`${idx}-${r?.level || 'note'}`}>{r?.message || t('subscription_update_available')}</p>
                    ))}
                </div>
            ) : null}

            {/* Fixed map height so the driver panel below stays visible (flex-1 map was pushing UI off-screen). */}
            <div className="h-[30vh] min-h-[200px] max-h-[320px] w-full shrink-0 border-b border-zinc-800 bg-zinc-950">
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

            <section className="flex-1 min-h-0 overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-[0_-12px_40px_rgba(0,0,0,0.4)] px-4 py-4 sm:px-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {isPlanExpired ? (
                    <div className="mb-3 rounded-xl border border-amber-700/50 bg-amber-950/40 p-3 text-amber-100">
                        <p className="text-sm font-semibold">{t('plan_expired')}</p>
                        <p className="mt-1 text-xs text-amber-200">{t('renew_to_go_online')}</p>
                    </div>
                ) : null}
                <CaptainDetails />
                {subscriptionStatus && !subscriptionStatus.active && (
                    <p className="text-amber-600 text-sm mt-3">{t('activate_subscription_to_receive')}</p>
                )}
            </section>

            <div ref={ridePopupPanelRef} className={`fixed left-0 right-0 mx-auto w-full max-w-[480px] z-[100] bottom-0 bg-white text-slate-900 px-3 py-10 pt-12 shadow-[0_-8px_30px_rgba(0,0,0,0.15)] max-h-[85vh] overflow-y-auto transition-transform duration-300 ease-in-out ${ridePopupPanel ? 'translate-y-0' : 'translate-y-full'}`}>
                <RidePopUp
                    ride={ride}
                    setRidePopupPanel={setRidePopupPanel}
                    onDismissPanel={dismissIncomingRequest}
                    confirmRide={confirmRide}
                    onReject={rejectRide}
                />
            </div>
            <div ref={confirmRidePopupPanelRef} className={`fixed left-0 right-0 mx-auto w-full max-w-[480px] h-screen z-[100] bottom-0 bg-white text-slate-900 px-3 py-10 pt-12 transition-transform duration-300 ease-in-out ${confirmRidePopupPanel ? 'translate-y-0' : 'translate-y-full'}`}>
                <ConfirmRidePopUp
                    ride={ride}
                    setConfirmRidePopupPanel={setConfirmRidePopupPanel} setRidePopupPanel={setRidePopupPanel} />
            </div>

            <DriverAcceptSuccessModal
                open={acceptSuccessOpen}
                onContinue={proceedToConfirmRidePanel}
            />
        </div>
    )
}

export default CaptainHome
