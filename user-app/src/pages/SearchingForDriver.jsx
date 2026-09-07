import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiClient, withAuth } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { stripApiEnvelope } from '../utils/apiBody'
import { RIDE_ACCEPTED, RIDE_STARTED, RIDE_COMPLETED, LOCATION_UPDATE } from '../constants/rideSocketEvents'
import { tierFare } from '../constants/rideTiers'
import { useSocket } from '../hooks/useSocket'
import RideMap from '../components/RideMap'
import bikeImg from '../assets/Bike-img-ride.png'
import autoImg from '../assets/Auto-img-ride.png'
import carImg from '../assets/Car-img-ride.png'
import luxuryImg from '../assets/luxury-img-ride.png'

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

/**
 * Pick the real vehicle photo for the driver card from the tier selected at
 * booking (e.g. PREMIUM) or the backend vehicle type (BIKE / AUTO / CAR).
 */
function vehicleImageFor (tierId, backendType) {
  const tier = String(tierId || '').toUpperCase()
  if (tier === 'PREMIUM' || tier === 'XL') return luxuryImg
  const type = String(backendType || '').toUpperCase()
  if (type === 'BIKE') return bikeImg
  if (type === 'AUTO') return autoImg
  if (type === 'CAR') return carImg
  return null
}

/**
 * Friendly descriptive vehicle label for the driver card — "Auto rickshaw",
 * "Bike", "Car" or "Premium/Luxury Car" — derived from the booked tier and
 * the backend vehicle type.
 */
function vehicleDetailLabel (tierId, backendType) {
  const tier = String(tierId || '').toUpperCase()
  const type = String(backendType || '').toUpperCase()
  if (tier === 'PREMIUM' || tier === 'XL' || type === 'PREMIUM' || type === 'PREMIUM_CAR' || type === 'LUXURY' || type === 'LUXURY_CAR') return 'Premium/Luxury Car'
  if (tier === 'BIKE' || type === 'BIKE') return 'Bike'
  if (tier === 'ECONOMY' || type === 'AUTO' || type === 'RICKSHAW') return 'Auto rickshaw'
  if (tier === 'COMFORT' || type === 'CAR') return 'Car'
  const raw = String(backendType || 'Ride').replace(/[_-]+/g, ' ').trim()
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

/**
 * Short vehicle label for the fare card — "Auto", "Bike", "Car" or
 * "Premium/Luxury Car" — derived from the booked tier and backend type.
 */
function vehicleShortLabel (tierId, backendType) {
  const tier = String(tierId || '').toUpperCase()
  const type = String(backendType || '').toUpperCase()
  if (tier === 'PREMIUM' || tier === 'XL' || type === 'PREMIUM' || type === 'PREMIUM_CAR' || type === 'LUXURY' || type === 'LUXURY_CAR') return 'Premium/Luxury Car'
  if (tier === 'BIKE' || type === 'BIKE') return 'Bike'
  if (tier === 'ECONOMY' || type === 'AUTO' || type === 'RICKSHAW') return 'Auto'
  if (tier === 'COMFORT' || type === 'CAR') return 'Car'
  const raw = String(backendType || 'Ride').replace(/[_-]+/g, ' ').trim()
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
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
 * Normalize a vehicle type/tier to the marker asset group: BIKE / AUTO / CAR / PREMIUM.
 * Accepts tier ids (ECONOMY → AUTO, COMFORT → CAR, PREMIUM/XL → PREMIUM) and
 * backend type spellings (e.g. RICKSHAW → AUTO, PREMIUM_CAR → PREMIUM).
 */
function normalizeVehicleTypeForMarkers (value) {
  const t = String(value || '').trim().toUpperCase()
  if (t === 'BIKE') return 'BIKE'
  if (t === 'ECONOMY' || t === 'AUTO' || t === 'RICKSHAW') return 'AUTO'
  if (t === 'COMFORT' || t === 'CAR') return 'CAR'
  if (t === 'PREMIUM' || t === 'LUXURY' || t === 'PREMIUM_CAR' || t === 'XL') return 'PREMIUM'
  return null
}

/**
 * Deterministic pseudo-random offsets around a point, so each ride shows the
 * same nearby vehicles while searching (no fake driver identities — purely
 * cosmetic map markers around the pickup area). Every marker is the same
 * vehicle type the user selected, so Bike riders only see Bikes, Auto riders
 * only Autos, etc.
 */
const NEARBY_VEHICLE_TYPES = [ 'BIKE', 'AUTO', 'CAR', 'PREMIUM' ]
function buildNearbyVehicles (lat, lng, seed, selectedType) {
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
      vehicleType: selectedType || NEARBY_VEHICLE_TYPES[i % NEARBY_VEHICLE_TYPES.length],
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
  const rideTierId = state.tierId || null
  const fare = state.price != null ? state.price : (ride?.price ?? ride?.fare ?? null)

  const pickupCoords = state.pickupCoords || null
  const dropCoords = state.dropCoords || null

  const [rideConfirmation, setRideConfirmation] = useState(null)
  const [cancelError, setCancelError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  /** Paying the 25% UPI advance at Card 3 (mock payment endpoint, same as completion). */
  const [payingAdvance, setPayingAdvance] = useState(false)
  const [advancePayError, setAdvancePayError] = useState('')
  /** Passenger OTP — backend only returns it once status is accepted/arrived. */
  const [passengerOtp, setPassengerOtp] = useState('')
  /** Guard so a single "started" event can't fire duplicate /riding navigations. */
  const startedHandledRef = useRef(null)

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
        const otpVal = o.otp ?? conf?.otp
        if (otpVal != null && String(otpVal).trim() !== '') setPassengerOtp(String(otpVal).trim())
      })
      .catch(() => { /* polling + socket will keep trying */ })
    return () => { cancelled = true }
  }, [rideId])

  /** Socket status events — mirrors Home.jsx handlers (OTP only arrives via REST). */
  useEffect(() => {
    if (!socket || !rideId) return

    const handleAccepted = (payload) => {
      const rideDoc = payload?.ride != null ? payload.ride : (payload?._id ? payload : null)
      if (!rideDoc || String(rideDoc._id) !== String(rideIdRef.current)) return
      setRide((prev) => ({ ...(prev || {}), ...rideDoc }))
      if (payload?.confirmation) setRideConfirmation((prev) => ({ ...(prev || {}), ...payload.confirmation }))
      const otpVal = payload?.confirmation?.otp ?? payload?.otp
      if (otpVal != null && String(otpVal).trim() !== '') setPassengerOtp(String(otpVal).trim())
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
          /* The REST poll effect below handles the actual navigation once the
             server confirms `started` — no stale timeout here. */
          startedHandledRef.current = null
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

  /**
   * Poll ride status while searching (8s) / after assignment (5s).
   * The same REST response carries the driver details + passenger OTP, and is
   * also the source of truth for advancing to the live-ride page once the
   * server confirms `started`.
   */
  useEffect(() => {
    if (!rideId) return
    const st = normalizeStatus(ride?.status)
    if (st === 'completed') return
    if (st === 'cancelled') {
      try { sessionStorage.removeItem(USER_RIDE_SESSION_KEY) } catch { /* ignore */ }
      navigateRef.current('/home', { replace: true })
      return
    }
    const isActive = !st || st === 'searching'
    const intervalMs = isActive ? 8000 : 5000

    let cancelled = false
    const tick = async () => {
      try {
        const res = await apiClient.get(`/rides/${rideId}`, withAuth())
        if (cancelled) return
        const o = stripApiEnvelope(res.data)
        const dst = normalizeStatus(o.status)
        if (dst === 'cancelled') {
          try { sessionStorage.removeItem(USER_RIDE_SESSION_KEY) } catch { /* ignore */ }
          navigateRef.current('/home', { replace: true })
          return
        }
        if (dst === 'started') {
          if (startedHandledRef.current === rideId) return
          startedHandledRef.current = rideId
          try { sessionStorage.removeItem(USER_RIDE_SESSION_KEY) } catch { /* ignore */ }
          navigateRef.current('/riding', { state: { ride: { ...(o || {}), status: 'started' } } })
          return
        }
        setRide((prev) => ({ ...(prev || {}), ...o, _id: o._id || prev?._id }))
        const conf = o.confirmation && typeof o.confirmation === 'object' ? { ...o.confirmation } : null
        if (conf) setRideConfirmation((prev) => ({ ...(prev || {}), ...conf }))
        const otpVal = o.otp ?? conf?.otp
        if (otpVal != null && String(otpVal).trim() !== '') setPassengerOtp(String(otpVal).trim())
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
  const confirmation = rideConfirmation
  const captain = ride?.captain
  const driverName = confirmation?.driverName || captain?.name || 'Your driver'
  const driverPhone = confirmation?.driverPhone || captain?.phone || ''
  const driverRating = confirmation?.driverRating != null ? Number(confirmation.driverRating) : null
  /** Driver photo — only shown when the backend actually provides one. */
  const driverPhoto = confirmation?.driverPhoto || captain?.photo || captain?.avatar || ''
  /** Vehicle type + number plate — show only what the backend actually provides. */
  const vehicleTypeText = confirmation?.vehicleType || ride?.vehicleType || captain?.vehicleType || ''
  const vehicleNumber = confirmation?.vehicleNumber || captain?.vehicleNumber || ''
  const tripCount = confirmation?.tripCount != null ? Number(confirmation.tripCount) : null
  const vehicleImage = vehicleImageFor(rideTierId, vehicleType)
  /** Card 1 type line (descriptive) + Card 3 fare row (short) labels. */
  const driverCardVehicleLabel = vehicleDetailLabel(rideTierId, vehicleTypeText)
  const fareCardVehicleLabel = vehicleShortLabel(rideTierId, vehicleTypeText)
  /** 25% advance (UPI) payment split — computed from the actual ride total. */
  const totalFareNum = Number(price)
  const advanceAmount = Number(ride?.advanceAmount) > 0
    ? Number(ride.advanceAmount)
    : (Number.isFinite(totalFareNum) && totalFareNum > 0 ? Math.round(totalFareNum * 0.25) : 0)
  const remainingAmount = Number(ride?.remainingAmount) > 0
    ? Number(ride.remainingAmount)
    : (Number.isFinite(totalFareNum) && totalFareNum > 0 ? Math.max(0, totalFareNum - advanceAmount) : 0)
  const advancePaid = ride?.advancePaymentStatus === 'success'
  /** Advance section appears once a driver is assigned — applies to every
     payment method, replacing the old Cash-only "pay at end" behavior. */
  const showAdvanceSection = !isSearching

  const messageDriver = useCallback((phone) => {
    const digits = String(phone || '').replace(/[^+\d]/g, '')
    if (!digits) return
    window.location.href = `sms:${digits}`
  }, [])
  const callDriver = useCallback((phone) => {
    const digits = String(phone || '').replace(/[^+\d]/g, '')
    if (!digits) return
    window.location.href = `tel:${digits}`
  }, [])

  /** Pay the 25% advance via the existing mock payment endpoint (same as completion). */
  const payAdvance = useCallback(async () => {
    if (!rideId || payingAdvance || advancePaid) return
    setPayingAdvance(true)
    setAdvancePayError('')
    try {
      const res = await apiClient.post('/rides/pay-mock', { rideId, method: 'UPI', part: 'advance' }, withAuth())
      const o = stripApiEnvelope(res.data)
      if (o?.ride) {
        setRide((prev) => ({ ...(prev || {}), ...o.ride, _id: o.ride._id || prev?._id }))
      }
    } catch (err) {
      setAdvancePayError(formatApiError(err))
    } finally {
      setPayingAdvance(false)
    }
  }, [rideId, payingAdvance, advancePaid])

  /** Nearby vehicle markers only while still searching — cosmetic map markers, cleared on assignment. */
  const [nearbyVehicles, setNearbyVehicles] = useState([])
  const nearbyTimerRef = useRef(null)
  const hasValidPickup = pickupCoords?.lat != null && pickupCoords?.lng != null
  /** Only show markers matching the ride type the user selected. */
  const selectedMarkerType = normalizeVehicleTypeForMarkers(rideTierId || vehicleType || ride?.vehicleType)
  useEffect(() => {
    if (!isSearching || !hasValidPickup) {
      setNearbyVehicles([])
      return () => clearInterval(nearbyTimerRef.current)
    }
    const seed = String(rideId || 'ride')
    const build = () => setNearbyVehicles(buildNearbyVehicles(pickupCoords.lat, pickupCoords.lng, seed, selectedMarkerType))
    build()
    nearbyTimerRef.current = setInterval(build, 4000)
    return () => {
      clearInterval(nearbyTimerRef.current)
      nearbyTimerRef.current = null
    }
  }, [isSearching, hasValidPickup, pickupCoords?.lat, pickupCoords?.lng, rideId, selectedMarkerType])

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
    : (isArrived ? 'Driver has arrived' : 'Your driver is coming')
  const sheetMessage = isSearching
    ? 'Connecting you with a nearby driver...'
    : (isArrived ? `${driverName} is at your pickup location.` : `${driverName} is on the way to your pickup.`)

  const mapShown = useMemo(() => !!pickupCoords || !!dropCoords, [pickupCoords, dropCoords])

  return (
    <div className="relative h-full w-full overflow-hidden bg-black text-white">
      {/* Map is the primary visual area — route + nearby vehicles while searching */}
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
                {!isSearching && confirmation?.eta && (
                  <p className="mt-1 text-xs text-zinc-500">
                    <i className="ri-time-line mr-1 align-[-1px]" aria-hidden />
                    Driver ETA ~{confirmation.eta}
                  </p>
                )}
              </div>
              {isSearching ? (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15" aria-hidden>
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-yellow border-t-transparent" />
                </span>
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15" aria-hidden>
                  <i className="ri-roadster-line text-lg text-emerald-400" />
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

            {/* Card 1 — Assigned / arrived: driver + vehicle details */}
            {!isSearching && (
              <div className="mt-4 rounded-xl border border-brand-border bg-brand-card/40 p-3">
                {/* Top row — driver info on the left, vehicle image + plate on the right */}
                <div className="flex items-center gap-3">
                  {driverPhoto ? (
                    <img
                      src={driverPhoto}
                      alt={driverName}
                      className="h-14 w-14 shrink-0 rounded-full border border-brand-border object-cover"
                    />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-lg font-bold text-brand-yellow" aria-hidden>
                      {driverName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Your driver</p>
                    <h4 className="truncate text-base font-semibold capitalize text-white">{driverName}</h4>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-400">
                      {driverPhone && (
                        <span>{driverPhone}</span>
                      )}
                      {tripCount != null && Number.isFinite(tripCount) && tripCount > 0 && (
                        <span>{tripCount} trips</span>
                      )}
                      {driverRating != null && Number.isFinite(driverRating) && driverRating > 0 && (
                        <span className="ml-1 text-amber-400">
                          <i className="ri-star-fill" aria-hidden /> {driverRating.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Vehicle image on the right side of the driver info — clean, no badge */}
                  <div className="shrink-0">
                    {vehicleImage ? (
                      <img
                        src={vehicleImage}
                        alt={driverCardVehicleLabel}
                        draggable={false}
                        className="h-16 w-20 object-contain"
                      />
                    ) : (
                      <i className="ri-roadster-line text-3xl text-brand-yellow" aria-hidden />
                    )}
                  </div>
                </div>

                {/* Vehicle type row — icon + vehicle type with the number plate after it */}
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2.5">
                  <i className="ri-roadster-line text-lg text-brand-yellow" aria-hidden />
                  <span className="truncate text-sm font-semibold text-white">{driverCardVehicleLabel}</span>
                  {vehicleNumber && (
                    <span className="ml-3 font-mono text-sm font-semibold tracking-wider text-zinc-300">{vehicleNumber}</span>
                  )}
                </div>

                {/* Message + Call actions — hidden (non-breaking) when no phone exists */}
                {driverPhone && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => messageDriver(driverPhone)}
                      className="flex items-center justify-center gap-2 rounded-xl border border-brand-border bg-brand-card/60 px-3 py-2.5 text-sm font-semibold text-white transition active:scale-[0.99]"
                    >
                      <i className="ri-chat-3-line text-base text-brand-yellow" aria-hidden />
                      Message
                    </button>
                    <button
                      type="button"
                      onClick={() => callDriver(driverPhone)}
                      className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-300 transition active:scale-[0.99]"
                    >
                      <i className="ri-phone-line text-base" aria-hidden />
                      Call
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Share PIN / OTP — only once the driver has ARRIVED */}
            {isArrived && passengerOtp && (
              <div className="mt-3 rounded-xl border-2 border-brand-yellow/60 bg-brand-yellow/10 px-4 py-3 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  <i className="ri-shield-keyhole-line mr-1 align-[-1px] text-brand-yellow" aria-hidden />
                  Share PIN
                </p>
                <p className="mt-1 font-mono text-3xl font-bold tracking-[0.25em] text-brand-yellow select-all" title="Share this code with your driver to start the ride">
                  {passengerOtp}
                </p>
                <p className="mt-1 text-xs text-zinc-500">Share this PIN with your driver to start the ride</p>
              </div>
            )}

            {/* Card 2 — Pickup and drop only (no vehicle type, fare or payment) */}
            <div className="mt-3 rounded-xl border border-brand-border bg-brand-card/40 px-3.5 py-3">
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center self-stretch pt-0.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-emerald-400 bg-emerald-400/20" aria-hidden />
                  <span className="my-1.5 w-px flex-1 bg-brand-border" aria-hidden />
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-rose-400 bg-rose-400/20" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-200">{pickup || '—'}</p>
                  <div className="my-2 h-px bg-brand-border" aria-hidden />
                  <p className="truncate text-sm font-medium text-zinc-200">{destination || '—'}</p>
                </div>
              </div>
            </div>

            {/* Card 3 — Vehicle type + total amount + 25% advance (UPI) */}
            <div className="mt-3 space-y-2.5 rounded-xl border border-brand-border bg-brand-card/40 px-3.5 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">{fareCardVehicleLabel}</span>
                <span className="text-sm font-bold text-brand-yellow">{formatPrice(price) ?? '—'}</span>
              </div>

              {showAdvanceSection && (
                <>
                  <div className="flex items-center justify-between border-t border-brand-border pt-2.5 text-sm">
                    <span className="text-zinc-400">25% Advance</span>
                    <span className="font-semibold text-white">{formatPrice(advanceAmount) ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400">Remaining 75%</span>
                    <span className="font-semibold text-white">{formatPrice(remainingAmount) ?? '—'}</span>
                  </div>
                  {advancePayError && (
                    <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{advancePayError}</p>
                  )}
                  {advancePaid ? (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
                      <span className="text-sm font-semibold text-emerald-300">
                        <i className="ri-checkbox-circle-fill mr-1.5 align-[-1px]" aria-hidden />
                        25% Advance Paid ✓
                      </span>
                      <span className="text-sm font-semibold text-white">Remaining 75%: {formatPrice(remainingAmount)}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={payAdvance}
                      disabled={payingAdvance || !rideId}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-yellow px-3 py-2.5 text-sm font-bold text-black transition active:scale-[0.99] disabled:opacity-50"
                    >
                      {payingAdvance ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" aria-hidden />
                          Processing…
                        </>
                      ) : (
                        <>
                          <i className="ri-qr-code-line text-base" aria-hidden />
                          Pay {formatPrice(advanceAmount)} Advance via UPI
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
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
