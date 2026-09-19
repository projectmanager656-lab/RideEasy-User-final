import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiClient, withAuth } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'
import { RIDE_ACCEPTED, RIDE_STARTED, RIDE_COMPLETED, LOCATION_UPDATE } from '../constants/rideSocketEvents'
import { useUserData } from '../context/UserContext'
import { useLanguage } from '../i18n'
import { useSocket } from '../hooks/useSocket'
import bikeImg from '../assets/Bike-img-ride.png'
import autoImg from '../assets/Auto-img-ride.png'
import carImg from '../assets/Car-img-ride.png'
import luxuryImg from '../assets/luxury-img-ride.png'

const USER_RIDE_SESSION_KEY = 'rideeasy_user_ride'

function normalizeStatus (s) {
  return String(s || '').trim().toLowerCase()
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

const UserOtp = () => {
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
  const pickupCoords = state.pickupCoords || null
  const dropCoords = state.dropCoords || null

  const [rideConfirmation, setRideConfirmation] = useState(state.confirmation || null)
  const [passengerOtp, setPassengerOtp] = useState(state.passengerOtp || '')
  const [copied, setCopied] = useState(false)

  const socket = useSocket()
  const { user: currentUser } = useUserData()
  const rideIdRef = useRef(rideId)
  rideIdRef.current = rideId
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const startedHandledRef = useRef(null)

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

  // Initial fetch for OTP
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
      setRide((prev) => {
        const base = { ...(prev || {}) }
        const next = data.ride ? { ...base, ...data.ride, status: data.status } : { ...base, status: data.status }
        if (data.confirmation) setRideConfirmation((prevConf) => ({ ...(prevConf || {}), ...data.confirmation }))
        if (data.status === 'completed' || data.status === 'cancelled') {
          try { sessionStorage.removeItem(USER_RIDE_SESSION_KEY) } catch { /* ignore */ }
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
        const otpVal = o.otp ?? conf?.otp
        if (otpVal != null && String(otpVal).trim() !== '') setPassengerOtp(String(otpVal).trim())
      } catch { /* ignore */ }
    }

    tick()
    const id = setInterval(tick, 4000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [rideId, ride?.status])

  const copyOtp = useCallback(() => {
    if (!passengerOtp) return
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(passengerOtp)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [passengerOtp])

  const captain = ride?.captain
  const confirmation = rideConfirmation
  const driverName = confirmation?.driverName || captain?.name || t('your_driver')
  const vehicleTypeText = confirmation?.vehicleType || ride?.vehicleType || captain?.vehicleType || ''
  const vehicleNumber = confirmation?.vehicleNumber || captain?.vehicleNumber || ''
  const vehicleImage = vehicleImageFor(rideTierId, vehicleType)
  const status = normalizeStatus(ride?.status)
  const isArrived = status === 'arrived'

  // ── Bottom-sheet drag logic ────────────────────────────────────────────────
  const sheetRef    = useRef(null)
  const [closing, setClosing]   = useState(false)
  const [expanded, setExpanded] = useState(false)
  const dragState = useRef({ active: false, startY: 0, startH: 0 })

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
        handleClose()
      } else if (h > screenH * 0.75) {
        sheet.style.height = `${screenH - 40}px`
        setExpanded(true)
      } else {
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
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center ${
        closing ? 'sheet-backdrop-out pointer-events-none' : 'sheet-backdrop-in'
      }`}
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(1px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        ref={sheetRef}
        className={`relative flex w-full max-w-[430px] flex-col rounded-t-[28px] border-t border-theme bg-theme-bg text-theme-primary shadow-[0_-8px_48px_rgba(0,0,0,0.45)] ${
          closing ? 'sheet-slide-down' : 'sheet-slide-up'
        }`}
        style={{ height: '50dvh' }}
        onAnimationEnd={onAnimationEnd}
      >
        {/* Drag handle */}
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
          <h1 className="text-base font-bold text-theme-primary">{t('ride_start_otp') || 'Ride Start OTP'}</h1>
          <button
            type="button"
            onClick={() => navigate('/safety')}
            className="flex h-9 items-center gap-1.5 rounded-full border border-theme bg-theme-card px-3 text-xs font-semibold text-brand-yellow transition active:scale-95"
          >
            <i className="ri-shield-check-line text-sm" aria-hidden />
            <span>{t('safety')}</span>
          </button>
        </header>

        {/* Scrollable content area */}
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex flex-col gap-4 p-4 pb-24">
        {/* Big OTP Highlight Card */}
        <div className="relative flex flex-col items-center overflow-hidden rounded-3xl border-2 border-brand-yellow/60 bg-gradient-to-b from-brand-yellow/15 to-brand-yellow/5 p-6 text-center shadow-xl shadow-brand-yellow/5">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-yellow/20 text-brand-yellow ring-4 ring-brand-yellow/10">
            <i className="ri-shield-keyhole-line text-2xl" aria-hidden />
          </div>

          <p className="mt-3 text-xs font-bold uppercase tracking-widest text-theme-secondary">
            {t('your_ride_otp')}
          </p>

          <div className="my-4 flex items-center justify-center gap-2 rounded-2xl border border-brand-yellow/40 bg-theme-card/90 px-6 py-4 shadow-inner">
            <p className="select-all font-mono text-4xl font-black tracking-[0.25em] text-brand-yellow drop-shadow-sm">
              {passengerOtp || '••••••'}
            </p>
          </div>

          <p className="text-xs text-theme-secondary">
            {t('share_pin_hint') || 'Share this 4-6 digit PIN with your driver to begin your journey.'}
          </p>

          {passengerOtp && (
            <button
              type="button"
              onClick={copyOtp}
              className="mt-4 flex items-center gap-2 rounded-full border border-brand-yellow/50 bg-brand-yellow/20 px-4 py-2 text-xs font-bold text-theme-primary transition active:scale-95"
            >
              <i className={copied ? 'ri-check-line text-emerald-400' : 'ri-file-copy-line text-brand-yellow'} aria-hidden />
              <span>{copied ? (t('copied') || 'Copied!') : (t('copy_otp') || 'Copy OTP')}</span>
            </button>
          )}
        </div>

        {/* Assigned Driver & Vehicle Quick Summary */}
        <div className="rounded-2xl border border-theme bg-theme-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-theme-muted">{t('assigned_driver') || 'Assigned Driver'}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${isArrived ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
              {isArrived ? (t('driver_arrived') || 'Driver Arrived') : (t('on_the_way') || 'On The Way')}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-lg font-bold text-brand-yellow">
              {driverName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-bold capitalize text-theme-primary">{driverName}</h3>
              <p className="text-xs text-theme-secondary">{vehicleDetailLabel(rideTierId, vehicleTypeText)}</p>
            </div>
            {vehicleNumber && (
              <span className="rounded-lg border border-theme bg-theme-card-muted px-2.5 py-1 font-mono text-xs font-bold tracking-wider text-theme-primary">
                {vehicleNumber}
              </span>
            )}
            {vehicleImage && (
              <div className="shrink-0">
                <img src={vehicleImage} alt="vehicle" className="h-10 w-12 object-contain" />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate('/driver-details', {
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
                price: fare,
              },
            })}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-theme bg-theme-card-muted py-2.5 text-xs font-bold text-theme-primary transition hover:bg-theme-card active:scale-[0.98]"
          >
            <i className="ri-user-star-line text-sm text-brand-yellow" aria-hidden />
            <span>{t('view_driver_details') || 'View Full Driver Details'}</span>
            <i className="ri-arrow-right-s-line text-sm text-theme-muted" aria-hidden />
          </button>
        </div>

        {/* Safety Instructions Checklist */}
        <div className="rounded-2xl border border-theme bg-theme-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <i className="ri-shield-check-fill text-lg text-brand-yellow" aria-hidden />
            <h4 className="text-sm font-bold text-theme-primary">{t('safety_checklist') || 'Safety Checklist'}</h4>
          </div>

          <div className="mt-3 space-y-2.5 text-xs text-theme-secondary">
            <div className="flex items-start gap-2.5">
              <i className="ri-checkbox-circle-fill mt-0.5 text-brand-yellow" aria-hidden />
              <span>{t('safety_check_plate') || 'Verify the vehicle registration number matches before boarding.'}</span>
            </div>
            <div className="flex items-start gap-2.5">
              <i className="ri-checkbox-circle-fill mt-0.5 text-brand-yellow" aria-hidden />
              <span>{t('safety_check_in_person') || 'Only share your OTP with your driver in person upon entering the vehicle.'}</span>
            </div>
            <div className="flex items-start gap-2.5">
              <i className="ri-checkbox-circle-fill mt-0.5 text-brand-yellow" aria-hidden />
              <span>{t('safety_check_phone') || 'Never share your ride OTP over phone calls or SMS messages.'}</span>
            </div>
          </div>
        </div>

        {/* Back to driver tracking */}
        <button
          type="button"
          onClick={() => navigate('/searching-for-driver', {
            state: {
              ride,
              pickupCoords,
              dropCoords,
              pickup,
              destination,
              passengerOtp,
              vehicleType,
              tierId: rideTierId,
              price: fare,
            },
          })}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-yellow py-3 text-sm font-bold text-black shadow transition active:scale-[0.98]"
        >
          <i className="ri-road-map-line text-base" aria-hidden />
          <span>{t('back_to_map_tracking') || 'Back to Live Tracking'}</span>
        </button>
        </div>
        </div> {/* end scrollable content */}
      </div> {/* end sheet panel */}
    </div>
  )
}

export default UserOtp
