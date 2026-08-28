import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiClient, withAuth } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { stripApiEnvelope } from '../utils/apiBody'
import { RIDE_ACCEPTED, RIDE_STARTED, RIDE_COMPLETED, LOCATION_UPDATE } from '../constants/rideSocketEvents'
import { tierLabel, tierFare } from '../constants/rideTiers'
import { useSocket } from '../hooks/useSocket'
import RideMap from '../components/RideMap'

const USER_RIDE_SESSION_KEY = 'rideeasy_user_ride'

/** Meters per degree latitude — used to spread nearby-vehicle markers around pickup. */
const M_PER_DEG_LAT = 111320

function normalizeStatus (s) {
  return String(s || '').trim().toLowerCase()
}

function formatPrice (n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return null
  return `₹${v.toFixed(2)}`
}

/** Selectable reasons shown in the cancellation sheet. */
const CANCEL_REASONS = [
  { label: 'Requested by accident', icon: 'ri-error-warning-line' },
  { label: 'Wait time was too long', icon: 'ri-time-line' },
  { label: 'Selected wrong pick-up', icon: 'ri-map-pin-user-line' },
  { label: 'Requested wrong vehicle', icon: 'ri-roadster-line' },
  { label: 'Selected wrong drop-off', icon: 'ri-map-pin-2-line' },
  { label: 'Other', icon: 'ri-more-2-fill' },
]

function seedingFromString (str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Deterministic pseudo-random offsets around a point, so each ride shows the
 * same nearby Autos while searching (no fake driver identities — purely
 * cosmetic map markers around the pickup area).
 */
function buildNearbyVehicles (lat, lng, seed) {
  const count = 7
  const out = []
  for (let i = 0; i < count; i += 1) {
    const s = seedingFromString(`${seed}:${i}`)
    const angle = ((s % 3600) / 10) * (Math.PI / 180)
    const dist = 120 + (s % 380)
    const dLat = (dist / M_PER_DEG_LAT) * Math.sin(angle)
    const dLng = (dist / (M_PER_DEG_LAT * Math.cos(lat * (Math.PI / 180)))) * Math.cos(angle)
    out.push({
      id: `nearby-${seed}-${i}`,
      lat: lat + dLat,
      lng: lng + dLng,
    })
  }
  return out
}

/**
 * Full-page Uber-style "Searching for Driver" screen entered from Choose Ride.
 * Map-first layout: the route map fills the screen, compact back + Safety
 * controls float on it, and a dark rounded bottom sheet carries the searching
 * status + compact ride summary + Cancel Ride. Reuses the same REST polling +
 * Socket.IO status flow used by Home. Ride creation stays in ChooseRide
 * (single POST /rides/create) — this page only monitors it.
 */
const SearchingForDriver = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state || {}

  /** Incoming ride from Choose Ride (created ride doc) or the persisted ride id. */
  const [ride, setRide] = useState(() => {
    if (state.ride?._id) return { ...state.ride }
    const id = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem(USER_RIDE_SESSION_KEY) : null
    if (id) return { _id: id }
    return null
  })
  const rideId = ride?._id || null

  /** Passed-through details from the Choose Ride screen (fall back to ride fields). */
  const pickup = state.pickup || ride?.pickupLocation || ''
  const destination = state.destination || ride?.dropLocation || ''
  const vehicleType = state.vehicleType || ride?.vehicleType || null
  const fare = state.price != null ? state.price : (ride?.price ?? ride?.fare ?? null)
  const paymentMethod = state.paymentMethod || ride?.paymentMethod || 'Cash'

  const pickupCoords = state.pickupCoords || null
  const dropCoords = state.dropCoords || null

  const [rideConfirmation, setRideConfirmation] = useState(null)
  const [cancelError, setCancelError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const socket = useSocket()
  const rideIdRef = useRef(null)
  rideIdRef.current = rideId
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  /** Persist the ride id under the existing session key so Home can restore it later. */
  useEffect(() => {
    if (!rideId) return
    try {
      sessionStorage.setItem(USER_RIDE_SESSION_KEY, String(rideId))
    } catch { /* ignore */ }
  }, [rideId])

  /** Missing ride — nothing to search for. */
  useEffect(() => {
    if (rideId) return
    navigate('/home', { replace: true })
  }, [rideId, navigate])

  /** One-shot live fetch so the ride doc + driver/status arrive immediately. */
  useEffect(() => {
    if (!rideId) return
    let cancelled = false
    apiClient.get(`/rides/${rideId}`, withAuth())
      .then((res) => {
        if (cancelled) return
        const o = stripApiEnvelope(res.data)
        const conf = o.confirmation && typeof o.confirmation === 'object' ? { ...o.confirmation } : null
        setRide((prev) => ({ ...(prev || {}), ...o, _id: o._id || prev?._id }))
        if (conf) setRideConfirmation(conf)
      })
      .catch(() => { /* polling + socket will keep trying */ })
    return () => { cancelled = true }
  }, [rideId])

  /** Socket status events — mirrors Home.jsx handlers (no OTP state here). */
  useEffect(() => {
    if (!socket || !rideId) return

    const handleAccepted = (payload) => {
      const rideDoc = payload?.ride != null ? payload.ride : (payload?._id ? payload : null)
      if (!rideDoc || String(rideDoc._id) !== String(rideIdRef.current)) return
      setRide((prev) => ({ ...(prev || {}), ...rideDoc }))
      if (payload?.confirmation) setRideConfirmation((prev) => ({ ...(prev || {}), ...payload.confirmation }))
    }

    const handleStatusUpdate = (data) => {
      if (!data?.status) return
      const incomingRid = data?.rideId != null ? String(data.rideId) : ''
      const currentRid = rideIdRef.current != null ? String(rideIdRef.current) : ''
      if (incomingRid && currentRid && incomingRid !== currentRid) return
      setRide((prev) => {
        const base = { ...(prev || {}) }
        const next = data.ride ? { ...base, ...data.ride, status: data.status } : { ...base, status: data.status }
        if (data.confirmation) setRideConfirmation((prevConf) => ({ ...(prevConf || {}), ...data.confirmation }))
        if (data.status === 'started' || data.status === 'completed' || data.status === 'cancelled') {
          try { sessionStorage.removeItem(USER_RIDE_SESSION_KEY) } catch { /* ignore */ }
        }
        if (data.status === 'started') {
          setTimeout(() => navigateRef.current('/riding', { state: { ride: next } }), 0)
        }
        return next
      })
    }

    const handleLocationUpdate = (payload) => {
      if (!payload || payload.source === 'passenger') return
      const incomingRid = payload?.rideId != null ? String(payload.rideId) : ''
      const currentRid = rideIdRef.current != null ? String(rideIdRef.current) : ''
      if (incomingRid && currentRid && incomingRid !== currentRid) return
      if (payload.lat != null && payload.lng != null) {
        setRideConfirmation((prev) => ({ ...(prev || {}), liveLocation: { lat: Number(payload.lat), lng: Number(payload.lng) } }))
      }
    }

    const handleRideStarted = (payload) => {
      handleStatusUpdate({
        rideId: payload?.rideId,
        status: 'started',
        ride: payload?.ride,
        confirmation: payload?.confirmation,
      })
    }

    const handleRideCompleted = (payload) => {
      handleStatusUpdate({
        rideId: payload?.rideId,
        status: 'completed',
        ride: payload?.ride,
      })
    }

    socket.on(RIDE_ACCEPTED, handleAccepted)
    socket.on(RIDE_STARTED, handleRideStarted)
    socket.on(RIDE_COMPLETED, handleRideCompleted)
    socket.on(LOCATION_UPDATE, handleLocationUpdate)
    socket.on('ride:status-update', handleStatusUpdate)

    return () => {
      socket.off(RIDE_ACCEPTED, handleAccepted)
      socket.off(RIDE_STARTED, handleRideStarted)
      socket.off(RIDE_COMPLETED, handleRideCompleted)
      socket.off(LOCATION_UPDATE, handleLocationUpdate)
      socket.off('ride:status-update', handleStatusUpdate)
    }
  }, [socket, rideId])

  /** Poll ride status while searching (8s) / after assignment (5s) — no OTP fetch. */
  useEffect(() => {
    if (!rideId) return
    const st = normalizeStatus(ride?.status)
    if (st === 'completed' || st === 'cancelled') return
    const isActive = !st || st === 'searching'
    const intervalMs = isActive ? 8000 : 5000

    let cancelled = false
    const tick = async () => {
      try {
        const res = await apiClient.get(`/rides/${rideId}`, withAuth())
        if (cancelled) return
        const o = stripApiEnvelope(res.data)
        setRide((prev) => ({ ...(prev || {}), ...o, _id: o._id || prev?._id }))
        const conf = o.confirmation && typeof o.confirmation === 'object' ? { ...o.confirmation } : null
        if (conf) setRideConfirmation((prev) => ({ ...(prev || {}), ...conf }))
      } catch { /* transient — keep polling */ }
    }

    tick()
    const id = setInterval(tick, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [rideId, ride?.status])

  /** Open the cancellation sheet (never navigates away by itself). */
  const openCancelSheet = useCallback(() => {
    setCancelError('')
    setCancelReason('')
    setCancelSheetOpen(true)
  }, [])

  const closeCancelSheet = useCallback(() => {
    if (cancelling) return
    setCancelSheetOpen(false)
  }, [cancelling])

  /** Actual cancellation via the existing backend endpoint, then return home. */
  const performCancel = useCallback(async () => {
    if (!rideId || cancelling) return
    setCancelling(true)
    setCancelError('')
    try {
      await apiClient.patch(`/rides/${rideId}/cancel`, { reason: cancelReason || 'Cancelled by passenger' }, withAuth())
    } catch (err) {
      setCancelError(formatApiError(err))
      setCancelling(false)
      return
    }
    try { sessionStorage.removeItem(USER_RIDE_SESSION_KEY) } catch { /* ignore */ }
    setCancelSheetOpen(false)
    navigate('/home', { replace: true })
  }, [rideId, cancelling, cancelReason, navigate])

  const goBack = useCallback(() => {
    navigate('/home', { replace: true })
  }, [navigate])

  const openSafety = useCallback(() => {
    navigate('/safety')
  }, [navigate])

  const status = normalizeStatus(ride?.status)
  const isSearching = !status || status === 'searching'
  const isAssigned = status === 'accepted'
  const isArrived = status === 'arrived'

  const price = fare ?? tierFare(vehicleType)
  const vehicleLabel = tierLabel(vehicleType) || String(vehicleType || 'Ride')
  const confirmation = rideConfirmation
  const captain = ride?.captain
  const driverName = confirmation?.driverName || captain?.name || 'Your driver'
  const driverPhone = confirmation?.driverPhone || captain?.phone || '—'
  const driverRating = confirmation?.driverRating != null ? Number(confirmation.driverRating) : null
  const vehicleNumber = confirmation?.vehicleNumber || captain?.vehicleNumber || '—'
  const vehicleModel = confirmation?.vehicleModel || captain?.vehicle?.model || vehicleLabel

  /** Nearby Autos only while still searching — cosmetic map markers, cleared on assignment. */
  const [nearbyVehicles, setNearbyVehicles] = useState([])
  const nearbyTimerRef = useRef(null)
  const hasValidPickup = pickupCoords?.lat != null && pickupCoords?.lng != null
  useEffect(() => {
    if (!isSearching || !hasValidPickup) {
      setNearbyVehicles([])
      return () => clearInterval(nearbyTimerRef.current)
    }
    const seed = String(rideId || 'ride')
    const build = () => setNearbyVehicles(buildNearbyVehicles(pickupCoords.lat, pickupCoords.lng, seed))
    build()
    nearbyTimerRef.current = setInterval(build, 4000)
    return () => {
      clearInterval(nearbyTimerRef.current)
      nearbyTimerRef.current = null
    }
  }, [isSearching, hasValidPickup, pickupCoords?.lat, pickupCoords?.lng, rideId])

  /** Estimated connection time while searching (best-effort, non-blocking). */
  const [etaText, setEtaText] = useState('')
  useEffect(() => {
    if (!isSearching || !hasValidPickup) {
      setEtaText('')
      return
    }
    let cancelled = false
    const eta = confirmation?.eta || confirmation?.etaMinutes
    if (eta != null) {
      setEtaText(typeof eta === 'number' ? `${Math.max(1, Math.round(eta))} min` : String(eta))
      return
    }
    if (confirmation?.liveLocation?.lat != null && confirmation?.liveLocation?.lng != null) return
    apiClient.get('/maps/get-distance-time', withAuth({
      params: { pickupLat: pickupCoords.lat, pickupLng: pickupCoords.lng },
    }))
      .then((res) => {
        if (cancelled) return
        const d = stripApiEnvelope(res.data)
        const etaMin = d?.etaMinutes ?? d?.etaMin ?? d?.eta ?? d?.durationMin ?? d?.minutes
        if (etaMin != null && Number.isFinite(Number(etaMin)) && Number(etaMin) > 0) {
          setEtaText(`${Math.max(1, Math.round(Number(etaMin)))} min`)
        }
      })
      .catch(() => { /* best-effort only */ })
    return () => { cancelled = true }
  }, [isSearching, hasValidPickup, pickupCoords?.lat, pickupCoords?.lng, confirmation?.eta, confirmation?.etaMinutes, confirmation?.liveLocation?.lat, confirmation?.liveLocation?.lng])

  /** Live driver pin used once a driver is assigned/arrived (socket + polling feed it). */
  const liveDriverCoords = confirmation?.liveLocation || null

  const sheetHeading = isSearching
    ? 'Looking for a driver'
    : (isArrived ? 'Driver has arrived' : 'Driver assigned')
  const sheetMessage = isSearching
    ? 'Connecting you with a nearby driver...'
    : (isArrived ? 'Your driver is at the pickup location.' : 'Your driver is on the way to your pickup.')

  const mapShown = useMemo(() => !!pickupCoords || !!dropCoords, [pickupCoords, dropCoords])

  return (
    <div className="relative h-full w-full overflow-hidden bg-black text-white">
      {/* Map is the primary visual area — route + nearby Autos while searching */}
      {mapShown && (
        <div className="absolute inset-0 z-0">
          <RideMap
            pickupCoords={pickupCoords}
            dropCoords={dropCoords}
            driverCoords={liveDriverCoords}
            nearbyVehicles={nearbyVehicles}
            showRoute={!!(pickupCoords && dropCoords)}
            showRouteStatsChip={false}
            showTrackingEta={false}
            zoomControlPosition="bottomleft"
            trackingFrom={(isAssigned || isArrived) && liveDriverCoords?.lat != null && pickupCoords?.lat != null ? liveDriverCoords : null}
            trackingTo={(isAssigned || isArrived) && liveDriverCoords?.lat != null && pickupCoords?.lat != null ? pickupCoords : null}
          />
        </div>
      )}

      {/* Compact floating controls on the map */}
      <div className="pointer-events-none absolute inset-0 z-30">
        <div className="mx-auto flex h-full w-full max-w-[430px] flex-col">
          <div className="flex shrink-0 items-center justify-between px-3 pb-0 pt-3">
            <button
              type="button"
              onClick={goBack}
              aria-label="Back to home"
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-brand-border bg-black/80 text-white shadow-lg backdrop-blur-sm active:scale-95"
            >
              <i className="ri-arrow-left-line text-lg" aria-hidden />
            </button>
            <button
              type="button"
              onClick={openSafety}
              aria-label="Safety"
              className="pointer-events-auto flex h-10 items-center gap-2 rounded-full border border-brand-border bg-black/80 px-3.5 text-sm font-semibold text-brand-yellow shadow-lg backdrop-blur-sm active:scale-95"
            >
              <i className="ri-shield-check-line text-base" aria-hidden />
              Safety
            </button>
          </div>
        </div>
      </div>

      {/* Dark rounded bottom sheet */}
      <div className="absolute inset-x-0 bottom-0 z-40">
        <div className="mx-auto max-w-[430px] rounded-t-[28px] border-t border-brand-border bg-[#101010] pb-[max(env(safe-area-inset-bottom,0px),12px)] shadow-[0_-8px_40px_rgba(0,0,0,0.45)]">
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-zinc-700" aria-hidden />

          <div className="max-h-[46dvh] overflow-y-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* Status header */}
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-white">{sheetHeading}</h2>
                <p className="mt-0.5 text-sm text-zinc-400">{sheetMessage}</p>
                {isSearching && etaText && (
                  <p className="mt-1 text-xs text-zinc-500">
                    <i className="ri-time-line mr-1 align-[-1px]" aria-hidden />
                    Usually connects in about {etaText}
                  </p>
                )}
              </div>
              {isSearching && (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15" aria-hidden>
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-yellow border-t-transparent" />
                </span>
              )}
            </div>

            {/* Subtle progress indicator */}
            {isSearching && (
              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-yellow" />
              </div>
            )}

            {/* Assignment / error banners */}
            {isAssigned && (
              <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                Driver assigned. Track the driver on the map.
              </div>
            )}
            {isArrived && (
              <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                Driver has arrived at your pickup location.
              </div>
            )}
            {cancelError && (
              <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {cancelError}
              </div>
            )}

            {/* Driver summary — only once a driver is assigned */}
            {!isSearching && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-brand-border bg-brand-card/40 px-3 py-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Your driver</p>
                  <h4 className="truncate text-base font-semibold capitalize text-white">{driverName}</h4>
                  <p className="text-xs text-zinc-400">{driverPhone}</p>
                  {driverRating != null && Number.isFinite(driverRating) && (
                    <p className="mt-0.5 text-xs text-amber-400">
                      <i className="ri-star-fill" aria-hidden /> {driverRating.toFixed(1)}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right text-xs">
                  <p className="font-medium text-zinc-200">{vehicleModel}</p>
                  <p className="text-zinc-400">{confirmation?.vehicleType || ride?.vehicleType || vehicleLabel}</p>
                  <p className="mt-0.5 font-mono font-semibold text-white">{vehicleNumber}</p>
                </div>
              </div>
            )}

            {/* Compact ride summary */}
            <div className="mt-3 divide-y divide-brand-border rounded-xl border border-brand-border bg-brand-card/40">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <i className="ri-roadster-line text-lg text-brand-yellow" aria-hidden />
                <span className="text-sm font-semibold text-white">{vehicleLabel}</span>
                <span className="ml-auto text-sm text-zinc-400">{formatPrice(price) ?? '—'}</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <i className="ri-map-pin-user-fill text-lg text-emerald-400" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">{pickup || '—'}</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <i className="ri-map-pin-2-fill text-lg text-rose-400" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">{destination || '—'}</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <i className="ri-money-rupee-circle-line text-lg text-brand-yellow" aria-hidden />
                <span className="text-sm text-zinc-300">{paymentMethod || 'Cash'} · Pay at end</span>
              </div>
            </div>

            {/* Cancel Ride — opens the cancellation sheet, never navigates directly */}
            <button
              type="button"
              onClick={openCancelSheet}
              disabled={cancelling}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-400 transition active:scale-[0.99] disabled:opacity-50"
            >
              {cancelling ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" aria-hidden />
                  Cancelling...
                </>
              ) : (
                <>
                  <i className="ri-close-circle-line text-lg" aria-hidden />
                  Cancel Ride
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Cancellation bottom sheet — shown over the ride screen, never navigates on open */}
      {cancelSheetOpen && (
        <div className="absolute inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-[1px]" onClick={closeCancelSheet} aria-hidden />
          <div className="relative flex max-h-[85dvh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[28px] border-t border-brand-border bg-[#101010] shadow-[0_-8px_40px_rgba(0,0,0,0.5)]">
            <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-zinc-700" aria-hidden />

            {/* Header */}
            <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-2">
              <button
                type="button"
                onClick={closeCancelSheet}
                aria-label="Back"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-border bg-brand-card text-white active:scale-95"
              >
                <i className="ri-arrow-left-line text-lg" aria-hidden />
              </button>
              <h2 className="text-base font-bold text-white">Cancel trip?</h2>
              <button
                type="button"
                onClick={() => performCancel()}
                disabled={cancelling}
                className="text-sm font-semibold text-brand-yellow active:scale-95 disabled:opacity-50"
              >
                {cancelling ? 'Cancelling...' : 'Skip'}
              </button>
            </div>

            {/* Scrollable content */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="mt-2">
                <h3 className="text-base font-semibold text-white">Why do you want to cancel?</h3>
                <p className="mt-0.5 text-xs text-zinc-500">Optional</p>
              </div>

              {cancelError && (
                <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  {cancelError}
                </div>
              )}

              {/* Selectable reasons */}
              <div className="mt-3 divide-y divide-brand-border overflow-hidden rounded-2xl border border-brand-border bg-brand-card/40">
                {CANCEL_REASONS.map((r) => {
                  const selected = cancelReason === r.label
                  return (
                    <button
                      key={r.label}
                      type="button"
                      onClick={() => setCancelReason(r.label)}
                      className={[
                        'flex w-full items-center gap-3 px-3.5 py-3 text-left transition active:scale-[0.99]',
                        selected ? 'bg-brand-yellow/10' : 'bg-transparent',
                      ].join(' ')}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${selected ? 'bg-brand-yellow text-black' : 'bg-brand-yellow/10 text-brand-yellow'}`}>
                        <i className={`${r.icon} text-base`} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-medium text-white">{r.label}</span>
                      {selected && <i className="ri-check-line text-brand-yellow" aria-hidden />}
                    </button>
                  )
                })}
              </div>

              {/* Proceed with selected reason */}
              <button
                type="button"
                onClick={() => performCancel()}
                disabled={!cancelReason || cancelling}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-400 transition active:scale-[0.99] disabled:opacity-50"
              >
                {cancelling ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" aria-hidden />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <i className="ri-close-circle-line text-lg" aria-hidden />
                    Cancel Ride
                  </>
                )}
              </button>

              {/* Keep my trip — closes the sheet without cancelling */}
              <button
                type="button"
                onClick={closeCancelSheet}
                disabled={cancelling}
                className="mt-3 w-full rounded-2xl bg-brand-yellow px-4 py-3.5 text-sm font-bold text-black transition active:scale-[0.99] disabled:opacity-50"
              >
                Keep my trip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SearchingForDriver
