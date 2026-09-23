import React, { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiClient, withAuth } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { stripApiEnvelope } from '../utils/apiBody'
import { RIDE_ACCEPTED, RIDE_STARTED, RIDE_COMPLETED, LOCATION_UPDATE } from '../constants/rideSocketEvents'
import { useUserData } from '../context/UserContext'
import { useLanguage } from '../i18n'
import { tierFare } from '../constants/rideTiers'
import { useSocket } from '../hooks/useSocket'
import RideMap from '../components/RideMap'
import bikeImg from '../assets/Bike-img-ride.png'
import autoImg from '../assets/Auto-img-ride.png'
import carImg from '../assets/Car-img-ride.png'
import luxuryImg from '../assets/luxury-img-ride.png'

const USER_RIDE_SESSION_KEY = 'rideeasy_user_ride'

function normalizeStatus (s) {
  return String(s || '').trim().toLowerCase()
}

function formatPrice (n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return null
  return `₹${v.toFixed(2)}`
}

function vehicleImageFor (tierId, backendType) {
  const tier = String(tierId || '').toUpperCase()
  if (tier === 'PREMIUM' || tier === 'XL') return luxuryImg
  const type = String(backendType || '').toUpperCase()
  if (type === 'BIKE') return bikeImg
  if (type === 'AUTO') return autoImg
  if (type === 'CAR') return carImg
  return null
}

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

const DriverDetails = () => {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state || {}

  const [ride, setRide] = useState(() => {
    if (state.ride?._id) return { ...state.ride }
    const id = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(USER_RIDE_SESSION_KEY) : null
    if (id) return { _id: id }
    return null
  })
  const rideId = ride?._id || null

  const pickup = state.pickup || ride?.pickupLocation || ''
  const destination = state.destination || ride?.dropLocation || ''
  const vehicleType = state.vehicleType || ride?.vehicleType || null
  const rideTierId = state.tierId || null
  const fare = state.price != null ? state.price : (ride?.price ?? ride?.fare ?? null)

  const [pickupCoords, setPickupCoords] = useState(state.pickupCoords || null)
  const [dropCoords, setDropCoords] = useState(state.dropCoords || null)
  const [rideConfirmation, setRideConfirmation] = useState(state.confirmation || null)
  const [passengerOtp, setPassengerOtp] = useState(state.passengerOtp || '')
  const [payingAdvance, setPayingAdvance] = useState(false)
  const [advancePayError, setAdvancePayError] = useState('')

  const socket = useSocket()
  const { user: currentUser } = useUserData()
  const rideIdRef = useRef(rideId)
  rideIdRef.current = rideId
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const startedHandledRef = useRef(null)

  const applyGeoFromRide = (o) => {
    const pc = o?.pickup?.coordinates
    const dc = o?.drop?.coordinates
    if (Array.isArray(pc) && pc.length === 2) {
      setPickupCoords((prev) => prev || { lat: Number(pc[1]), lng: Number(pc[0]) })
    }
    if (Array.isArray(dc) && dc.length === 2) {
      setDropCoords((prev) => prev || { lat: Number(dc[1]), lng: Number(dc[0]) })
    }
  }

  useEffect(() => {
    if (!rideId) {
      navigate('/home', { replace: true })
      return
    }
    try {
      sessionStorage.setItem(USER_RIDE_SESSION_KEY, String(rideId))
    } catch { /* ignore */ }
  }, [rideId, navigate])

  useEffect(() => {
    if (!socket || !currentUser?._id) return
    const uid = String(currentUser._id)
    const emitJoin = () => socket.emit('join', { userType: 'user', userId: uid })
    emitJoin()
    socket.on('connect', emitJoin)
    return () => {
      socket.off('connect', emitJoin)
    }
  }, [socket, currentUser?._id])

  // Initial fetch
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
        applyGeoFromRide(o)
        const otpVal = o.otp ?? conf?.otp
        if (otpVal != null && String(otpVal).trim() !== '') setPassengerOtp(String(otpVal).trim())
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [rideId])

  // Socket listeners
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
      if (data.status === 'started') {
        if (startedHandledRef.current === currentRid) return
        startedHandledRef.current = currentRid
        const nextRide = data.ride
          ? { ...data.ride, status: 'started' }
          : { _id: currentRid, status: 'started' }
        navigateRef.current('/riding', { state: { ride: nextRide } })
        return
      }
      /**
       * The `arrived` event carries the passenger OTP inside `confirmation`
       * (emitted only to this passenger's private socket room). Capture it here so
       * the PIN appears the moment the driver arrives — no refresh needed.
       * Side effects are kept OUT of the setRide updater so React can safely
       * re-invoke it (updaters must stay pure).
       */
      if (data.confirmation) setRideConfirmation((prev) => ({ ...(prev || {}), ...data.confirmation }))
      const otpVal = data.confirmation?.otp ?? data.otp
      if (otpVal != null && String(otpVal).trim() !== '') setPassengerOtp(String(otpVal).trim())
      if (data.status === 'completed' || data.status === 'cancelled') {
        try { sessionStorage.removeItem(USER_RIDE_SESSION_KEY) } catch { /* ignore */ }
      }
      setRide((prev) => {
        const base = { ...(prev || {}) }
        return data.ride
          ? { ...base, ...data.ride, status: data.status }
          : { ...base, status: data.status }
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
   * Authoritative OTP re-sync. If the ride is `arrived` but the socket payload did
   * not deliver the PIN (partial payload / event race), read the ride once from the
   * backend — the same source the mount-fetch and refresh use — and apply it.
   * Read-only: `GET /rides/:id` only decrypts the existing PIN, it never mints a new
   * one. Runs at most once per arrival because `passengerOtp` short-circuits it.
   */
  useEffect(() => {
    if (!rideId || passengerOtp) return
    if (normalizeStatus(ride?.status) !== 'arrived') return
    let cancelled = false
    apiClient.get(`/rides/${rideId}`, withAuth())
      .then((res) => {
        if (cancelled) return
        const o = stripApiEnvelope(res.data)
        const conf = o.confirmation && typeof o.confirmation === 'object' ? o.confirmation : null
        if (conf) setRideConfirmation((prev) => ({ ...(prev || {}), ...conf }))
        const otpVal = o.otp ?? conf?.otp
        if (otpVal != null && String(otpVal).trim() !== '') setPassengerOtp(String(otpVal).trim())
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [rideId, ride?.status, passengerOtp])

  // Periodic polling for status & OTP
  useEffect(() => {
    if (!rideId) return
    const st = normalizeStatus(ride?.status)
    if (st === 'completed') return
    if (st === 'cancelled') {
      try { sessionStorage.removeItem(USER_RIDE_SESSION_KEY) } catch { /* ignore */ }
      navigateRef.current('/home', { replace: true })
      return
    }

    let cancelled = false
    const tick = async () => {
      try {
        const res = await apiClient.get(`/rides/${rideId}`, withAuth())
        if (cancelled) return
        const o = stripApiEnvelope(res.data)
        const dst = normalizeStatus(o.status)
        if (dst === 'started') {
          if (startedHandledRef.current === rideId) return
          startedHandledRef.current = rideId
          navigateRef.current('/riding', { state: { ride: { ...(o || {}), status: 'started' } } })
          return
        }
        setRide((prev) => ({ ...(prev || {}), ...o, _id: o._id || prev?._id }))
        const conf = o.confirmation && typeof o.confirmation === 'object' ? { ...o.confirmation } : null
        if (conf) setRideConfirmation((prev) => ({ ...(prev || {}), ...conf }))
        applyGeoFromRide(o)
        const otpVal = o.otp ?? conf?.otp
        if (otpVal != null && String(otpVal).trim() !== '') setPassengerOtp(String(otpVal).trim())
      } catch { /* ignore */ }
    }

    tick()
    const id = setInterval(tick, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [rideId, ride?.status])

  const captain = ride?.captain
  const confirmation = rideConfirmation
  const driverName = confirmation?.driverName || captain?.name || t('your_driver')
  const driverPhone = confirmation?.driverPhone || captain?.phone || ''
  const driverRating = confirmation?.driverRating != null ? Number(confirmation.driverRating) : null
  const driverPhoto = confirmation?.driverPhoto || captain?.photo || captain?.avatar || ''
  const vehicleTypeText = confirmation?.vehicleType || ride?.vehicleType || captain?.vehicleType || ''
  const vehicleNumber = confirmation?.vehicleNumber || captain?.vehicleNumber || ''
  const tripCount = confirmation?.tripCount != null ? Number(confirmation.tripCount) : null
  const vehicleImage = vehicleImageFor(rideTierId, vehicleType)
  const status = normalizeStatus(ride?.status)
  const isArrived = status === 'arrived'

  const price = fare ?? tierFare(vehicleType)
  const totalFareNum = Number(price)
  const advanceAmount = Number(ride?.advanceAmount) > 0
    ? Number(ride.advanceAmount)
    : (Number.isFinite(totalFareNum) && totalFareNum > 0 ? Math.round(totalFareNum * 0.25) : 0)
  const remainingAmount = Number(ride?.remainingAmount) > 0
    ? Number(ride.remainingAmount)
    : (Number.isFinite(totalFareNum) && totalFareNum > 0 ? Math.max(0, totalFareNum - advanceAmount) : 0)
  const advancePaid = ride?.advancePaymentStatus === 'success'

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

  const liveDriverCoords = confirmation?.liveLocation || null

  // ── Bottom-sheet drag logic ────────────────────────────────────────────────
  const sheetRef    = useRef(null)
  const [closing, setClosing]   = useState(false)
  const [expanded, setExpanded] = useState(false)
  const dragState = useRef({ active: false, startY: 0, startH: 0 })

  // Resolve the initial height once the sheet mounts (50 dvh)
  useLayoutEffect(() => {
    if (sheetRef.current && !expanded) {
      sheetRef.current.style.height = '50dvh'
    }
  }, [])

  const handleClose = useCallback(() => {
    setClosing(true)
  }, [])

  const onAnimationEnd = useCallback(() => {
    if (closing) navigate(-1)
  }, [closing, navigate])

  // Pointer-based drag: drag up → expand; drag down past threshold → close
  const onDragStart = useCallback((e) => {
    const sheet = sheetRef.current
    if (!sheet) return
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    dragState.current = { active: true, startY: clientY, startH: sheet.offsetHeight }
    e.preventDefault()
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      if (!dragState.current.active) return
      const sheet = sheetRef.current
      if (!sheet) return
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      const delta   = clientY - dragState.current.startY
      const newH    = Math.max(120, Math.min(window.innerHeight - 40, dragState.current.startH - delta))
      sheet.style.height = `${newH}px`
    }
    const onEnd = (e) => {
      if (!dragState.current.active) return
      const sheet = sheetRef.current
      dragState.current.active = false
      if (!sheet) return
      const h = sheet.offsetHeight
      const screenH = window.innerHeight
      if (h < screenH * 0.25) {
        // dragged way down — close
        handleClose()
      } else if (h > screenH * 0.75) {
        // dragged way up — snap to full
        sheet.style.height = `${screenH - 40}px`
        setExpanded(true)
      } else {
        // snap to half
        sheet.style.height = '50dvh'
        setExpanded(false)
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onEnd)
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend',  onEnd)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onEnd)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend',  onEnd)
    }
  }, [handleClose])
  // ─────────────────────────────────────────────────────────────────────────

  return (
    // Full-screen backdrop
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center ${
        closing ? 'sheet-backdrop-out pointer-events-none' : 'sheet-backdrop-in'
      }`}
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(1px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      {/* Sheet panel */}
      <div
        ref={sheetRef}
        className={`relative flex w-full max-w-[430px] flex-col rounded-t-[28px] border-t border-theme bg-theme-bg text-theme-primary shadow-[0_-8px_48px_rgba(0,0,0,0.45)] ${
          closing ? 'sheet-slide-down' : 'sheet-slide-up'
        }`}
        style={{ height: '50dvh' }}
        onAnimationEnd={onAnimationEnd}
      >
        {/* Drag handle bar */}
        <div
          className="flex shrink-0 cursor-grab items-center justify-center py-3 active:cursor-grabbing touch-none select-none"
          onMouseDown={onDragStart}
          onTouchStart={onDragStart}
          aria-label="Drag to resize"
        >
          <div className="h-1 w-10 rounded-full bg-theme-muted opacity-60" />
        </div>

        {/* Top Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-theme bg-theme-bg/95 px-4 pb-3 backdrop-blur-md">
          <button
            type="button"
            onClick={handleClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-theme bg-theme-card text-theme-primary transition active:scale-95"
            aria-label={t('back')}
          >
            <i className="ri-arrow-left-line text-lg" aria-hidden />
          </button>
          <h1 className="text-base font-bold text-theme-primary">{t('driver_details') || 'Driver Details'}</h1>
          <button
            type="button"
            onClick={() => navigate('/safety')}
            className="flex h-9 items-center gap-1.5 rounded-full border border-theme bg-theme-card px-3 text-xs font-semibold text-brand-yellow transition active:scale-95"
          >
            <i className="ri-shield-check-line text-sm" aria-hidden />
            <span>{t('safety')}</span>
          </button>
        </header>

        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex flex-col gap-4 p-4 pb-24">
        {/* Status Alert Banner */}
        <div className={`flex items-center gap-3 rounded-2xl border p-3.5 ${isArrived ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'}`}>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isArrived ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            <i className={`text-xl ${isArrived ? 'ri-map-pin-2-fill' : 'ri-roadster-fill'}`} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-theme-primary">
              {isArrived ? (t('driver_has_arrived') || 'Driver Has Arrived') : (t('your_driver_is_coming') || 'Driver is on the way')}
            </h2>
            <p className="text-xs text-theme-secondary">
              {confirmation?.eta ? (t('driver_eta', { eta: confirmation.eta }) || `ETA: ${confirmation.eta}`) : (isArrived ? t('driver_arrived_at_pickup') : t('connecting_with_nearby_driver'))}
            </p>
          </div>
        </div>

        {/* Driver Profile Card */}
        <div className="rounded-2xl border border-theme bg-theme-card p-4 shadow-sm">
          <div className="flex items-center gap-3.5">
            {driverPhoto ? (
              <img
                src={driverPhoto}
                alt={driverName}
                className="h-16 w-16 shrink-0 rounded-full border-2 border-brand-yellow object-cover shadow"
              />
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-2xl font-bold text-brand-yellow ring-2 ring-brand-yellow/30">
                {driverName.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">{t('your_driver')}</p>
              <h3 className="truncate text-lg font-bold capitalize text-theme-primary">{driverName}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-theme-secondary">
                {driverRating != null && Number.isFinite(driverRating) && driverRating > 0 && (
                  <span className="flex items-center gap-1 font-semibold text-amber-400">
                    <i className="ri-star-fill text-xs" aria-hidden />
                    {driverRating.toFixed(1)}
                  </span>
                )}
                {tripCount != null && Number.isFinite(tripCount) && tripCount > 0 && (
                  <span>{t('trips_count', { count: tripCount })}</span>
                )}
              </div>
            </div>
            {vehicleImage && (
              <div className="shrink-0">
                <img
                  src={vehicleImage}
                  alt="vehicle"
                  className="h-14 w-16 object-contain"
                />
              </div>
            )}
          </div>

          {/* Quick Communication Buttons */}
          {driverPhone && (
            <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-theme pt-3.5">
              <button
                type="button"
                onClick={() => messageDriver(driverPhone)}
                className="flex items-center justify-center gap-2 rounded-xl border border-theme bg-theme-card-muted py-2.5 text-sm font-semibold text-theme-primary transition active:scale-[0.98]"
              >
                <i className="ri-chat-3-line text-base text-brand-yellow" aria-hidden />
                <span>{t('message')}</span>
              </button>
              <button
                type="button"
                onClick={() => callDriver(driverPhone)}
                className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 py-2.5 text-sm font-semibold text-emerald-300 transition active:scale-[0.98]"
              >
                <i className="ri-phone-line text-base" aria-hidden />
                <span>{t('call')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Vehicle Details Card */}
        <div className="rounded-2xl border border-theme bg-theme-card p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-theme-muted">{t('vehicle_details') || 'Vehicle Details'}</span>
            <span className="rounded-full bg-theme-card-muted px-2.5 py-0.5 text-xs font-semibold text-brand-yellow">
              {vehicleDetailLabel(rideTierId, vehicleTypeText)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-xl bg-theme-card-muted p-3">
            <div className="flex items-center gap-2.5">
              <i className="ri-roadster-line text-xl text-brand-yellow" aria-hidden />
              <span className="text-sm font-semibold text-theme-primary">{vehicleDetailLabel(rideTierId, vehicleTypeText)}</span>
            </div>
            {vehicleNumber ? (
              <span className="rounded-lg border border-theme bg-theme-card px-3 py-1 font-mono text-sm font-bold tracking-wider text-theme-primary shadow-inner">
                {vehicleNumber}
              </span>
            ) : (
              <span className="text-xs text-theme-muted">{t('number_plate_pending') || 'Number Plate Available Soon'}</span>
            )}
          </div>
        </div>

        {/* User OTP Banner / Shortcut */}
        <div className="flex items-center justify-between rounded-2xl border-2 border-brand-yellow/60 bg-brand-yellow/10 p-4 shadow-sm">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-theme-secondary">{t('your_ride_otp')}</span>
            <p className="font-mono text-2xl font-black tracking-[0.2em] text-brand-yellow">
              {passengerOtp || '••••••'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/user-otp', {
              state: {
                ride,
                pickupCoords,
                dropCoords,
                pickup,
                destination,
                passengerOtp,
                confirmation: rideConfirmation,
                vehicleType,
                tierId: rideTierId,
                price,
              },
            })}
            className="flex items-center gap-1.5 rounded-xl bg-brand-yellow px-4 py-2.5 text-xs font-bold text-black shadow transition active:scale-95"
          >
            <span>{t('view_otp_page') || 'View OTP Page'}</span>
            <i className="ri-arrow-right-line" aria-hidden />
          </button>
        </div>

        {/* Live Route Map */}
        {(pickupCoords || dropCoords || liveDriverCoords) && (
          <div className="h-48 w-full overflow-hidden rounded-2xl border border-theme shadow-sm">
            <RideMap
              pickupCoords={pickupCoords}
              dropCoords={dropCoords}
              driverCoords={liveDriverCoords}
              showRoute={Boolean(pickupCoords && dropCoords)}
              showRouteStatsChip={false}
              showTrackingEta={false}
              zoomControlPosition="bottomleft"
              trackingFrom={liveDriverCoords?.lat != null && pickupCoords?.lat != null ? liveDriverCoords : null}
              trackingTo={liveDriverCoords?.lat != null && pickupCoords?.lat != null ? pickupCoords : null}
            />
          </div>
        )}

        {/* Trip Route Card */}
        <div className="rounded-2xl border border-theme bg-theme-card p-4 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-theme-muted">{t('route') || 'Trip Route'}</span>
          <div className="mt-3 flex items-start gap-3">
            <div className="flex flex-col items-center self-stretch pt-0.5">
              <span className="h-3 w-3 shrink-0 rounded-full border-2 border-emerald-400 bg-emerald-400/20" aria-hidden />
              <span className="my-1.5 w-px flex-1 bg-theme-border" aria-hidden />
              <span className="h-3 w-3 shrink-0 rounded-full border-2 border-rose-400 bg-rose-400/20" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-[10px] font-semibold uppercase text-theme-muted">{t('pickup')}</p>
                <p className="truncate text-sm font-medium text-theme-primary">{pickup || '—'}</p>
              </div>
              <div className="border-t border-theme pt-2">
                <p className="text-[10px] font-semibold uppercase text-theme-muted">{t('drop')}</p>
                <p className="truncate text-sm font-medium text-theme-primary">{destination || '—'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Fare & Advance Payment */}
        <div className="rounded-2xl border border-theme bg-theme-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-theme-muted">{t('fare_details') || 'Fare Details'}</span>
            <span className="text-base font-bold text-brand-yellow">{formatPrice(price) ?? '—'}</span>
          </div>

          <div className="mt-3 space-y-2 border-t border-theme pt-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-theme-secondary">{t('advance_25')}</span>
              <span className="font-semibold text-theme-primary">{formatPrice(advanceAmount) ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-theme-secondary">{t('remaining_75')}</span>
              <span className="font-semibold text-theme-primary">{formatPrice(remainingAmount) ?? '—'}</span>
            </div>

            {advancePayError && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{advancePayError}</p>
            )}

            {advancePaid ? (
              <div className="mt-2 flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-300">
                <span>
                  <i className="ri-checkbox-circle-fill mr-1.5" aria-hidden />
                  {t('advance_25_paid')}
                </span>
                <span className="text-theme-primary">{t('remaining_75_amount', { amount: formatPrice(remainingAmount) })}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={payAdvance}
                disabled={payingAdvance || !rideId}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-yellow px-3 py-2.5 text-sm font-bold text-black shadow transition active:scale-[0.99] disabled:opacity-50"
              >
                {payingAdvance ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" aria-hidden />
                    <span>{t('processing')}</span>
                  </>
                ) : (
                  <>
                    <i className="ri-qr-code-line text-base" aria-hidden />
                    <span>{t('pay_advance_upi', { amount: formatPrice(advanceAmount) })}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        </div>
        </div> {/* end scrollable content */}
      </div> {/* end sheet panel */}
    </div> // end backdrop
  )
}

export default DriverDetails
