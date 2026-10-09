import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import RideMap from '../components/RideMap'
import ScheduledRideConfirmation from '../components/ScheduledRideConfirmation'
import { apiClient, withAuth } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'
import { formatApiError } from '../utils/apiError'
import { useLanguage } from '../i18n'
import { useUserData } from '../context/UserContext'
import { writeRideSessionId } from '../utils/rideSession'
import { haversineKm } from '../utils/serviceArea'

/**
 * Fare-protection circle: while the adjusted pickup stays within this distance
 * of the pickup the displayed fare was computed for, the fare is kept. Beyond
 * it, a fresh fare is requested from the backend (never computed locally).
 */
const PICKUP_FARE_RADIUS_METERS = 200
const FARE_RECALC_DEBOUNCE_MS = 600

function normalizeCoordinates(value) {
    if (!value || typeof value !== 'object') return null

    const lat = Number(value.lat ?? value.latitude)
    const lng = Number(value.lng ?? value.longitude)

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

    return { lat, lng }
}

function formatPrice(value) {
    const amount = Number(value)

    return Number.isFinite(amount) && amount > 0
        ? `₹${amount.toFixed(2)}`
        : '—'
}

export default function ConfirmPickup() {
    const navigate = useNavigate()
    const location = useLocation()

    const { t } = useLanguage()
    const { user } = useUserData()

    const state = location.state || {}

    const initialPickupCoords = normalizeCoordinates(state.pickupCoords)
    const dropCoords = normalizeCoordinates(state.dropCoords)

    const [pickupCoords, setPickupCoords] = useState(initialPickupCoords)
    const [pickup, setPickup] = useState(state.pickup || '')

    /**
     * The pickup the displayed fare was computed for (the circle's center).
     * It only moves after a successful backend recalculation for a pickup
     * outside the circle — never on every marker move.
     */
    const [originalPickup, setOriginalPickup] = useState(initialPickupCoords)

    /** Fare shown on this screen; starts from the backend quote ChooseRide passed. */
    const [fareState, setFareState] = useState({
        price: state.price ?? null,
        discountAmount: state.discountAmount ?? 0,
        finalFare: state.finalFare ?? state.price ?? null,
        couponCode: state.couponCode || '',
    })
    const [fareRecalculating, setFareRecalculating] = useState(false)
    const [fareNote, setFareNote] = useState('')
    /**
     * Quoted-but-not-yet-accepted fare for a pickup outside the 200m circle:
     * `{ coords, price, discountAmount, finalFare, couponCode }`. The displayed
     * fare and the circle reference only commit when the passenger accepts it.
     */
    const [pendingFare, setPendingFare] = useState(null)
    const [fareRecalcFailed, setFareRecalcFailed] = useState(false)

    const [locationLoading, setLocationLoading] = useState(false)
    const [locationError, setLocationError] = useState('')

    const [booking, setBooking] = useState(false)
    const [bookingError, setBookingError] = useState('')

    const [scheduledRide, setScheduledRide] = useState(null)

    const geocodeRequestRef = useRef(0)
    /** Latest-wins guard for fare recalculations. */
    const fareRequestRef = useRef(0)
    const fareDebounceRef = useRef(null)
    /** Coordinates of the recalculation currently in flight (dedupes settle jitter). */
    const inFlightFareKeyRef = useRef(null)
    /** Mirrors originalPickup so rapid map-move events never read stale state. */
    const originalPickupRef = useRef(initialPickupCoords)
    /** Latest fare/coupon data for handlers that outlive a render (debounce timers). */
    const fareStateRef = useRef(fareState)
    fareStateRef.current = fareState
    const pickupRef = useRef(pickup)
    pickupRef.current = pickup
    /** Inside/outside classification — logged only on change or settle, never per frame. */
    const lastFareZoneRef = useRef(null)
    /** Last position quoted outside the circle — target for a manual retry. */
    const lastOutsideCoordsRef = useRef(null)

    useEffect(() => () => clearTimeout(fareDebounceRef.current), [])

    const updatePickupCoords = useCallback((coords) => {
        setPickupCoords(coords)
    }, [])

    const updatePickupAddress = useCallback(async (coords) => {
        setLocationLoading(true)
        setLocationError('')

        const requestId = ++geocodeRequestRef.current

        try {
            const response = await apiClient.get(
                '/maps/get-address',
                withAuth({
                    params: {
                        lat: coords.lat,
                        lng: coords.lng,
                    },
                })
            )

            if (requestId !== geocodeRequestRef.current) return

            const address = response.data?.address

            if (address) {
                setPickup(address)
            } else {
                setLocationError(
                    'Pickup address is unavailable. The selected map location will still be used.'
                )
            }
        } catch (error) {
            if (requestId === geocodeRequestRef.current) {
                setLocationError(
                    formatApiError(error) ||
                    'Pickup address is unavailable. The selected map location will still be used.'
                )
            }
        } finally {
            if (requestId === geocodeRequestRef.current) {
                setLocationLoading(false)
            }
        }
    }, [])

    /**
     * Ask the backend to price the ride for a NEW pickup coordinate. The
     * response always wins over any earlier in-flight request. On success the
     * quote is STAGED for passenger acceptance — the displayed fare and the
     * 200m reference/circle only move once they accept (see acceptPendingFare).
     */
    const requestFareRecalc = async (coords) => {
        if (!coords || !dropCoords || !state.vehicleType || booking) return

        const coordKey = `${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`
        if (inFlightFareKeyRef.current === coordKey) return

        const requestId = ++fareRequestRef.current
        inFlightFareKeyRef.current = coordKey
        setFareRecalculating(true)

        console.info('[PickupFare] request', {
            fareRequestId: requestId,
            pickup: coords,
            dropCoords,
            vehicleType: state.vehicleType,
        })

        try {
            const response = await apiClient.get(
                '/rides/get-fare',
                withAuth({
                    params: {
                        pickup: pickupRef.current || 'Selected map location',
                        destination: state.destination,
                        pickupLat: coords.lat,
                        pickupLng: coords.lng,
                        dropLat: dropCoords.lat,
                        dropLng: dropCoords.lng,
                    },
                })
            )

            if (requestId !== fareRequestRef.current) return

            const fare = stripApiEnvelope(response.data) || {}
            const price = Number(fare[state.vehicleType])

            if (!Number.isFinite(price) || price <= 0) {
                console.warn('[PickupFare] response missing vehicle price', {
                    fareRequestId: requestId,
                    vehicleType: state.vehicleType,
                })
                return
            }

            /** Coupon amounts depend on the fare — revalidate against the new price. */
            let discountAmount = 0
            let finalFare = price
            let couponCode = ''

            const appliedCode = String(fareStateRef.current.couponCode || '').trim().toUpperCase()
            if (appliedCode) {
                try {
                    const couponRes = await apiClient.post(
                        '/users/coupons/validate',
                        { code: appliedCode, fare: price },
                        withAuth()
                    )
                    const couponBody = stripApiEnvelope(couponRes.data)
                    discountAmount = Number(couponBody?.discountAmount || 0)
                    finalFare = couponBody?.finalFare != null ? Number(couponBody.finalFare) : price
                    couponCode = appliedCode
                } catch {
                    /** Coupon no longer valid for the new fare — it will be dropped on accept. */
                }
            }

            /** The passenger may have come back inside the circle mid-request. */
            if (requestId !== fareRequestRef.current) return

            console.info('[PickupFare]', {
                fareRequestId: requestId,
                pickup: coords,
                routeKm: fare.distanceKm,
                oldFare: fareStateRef.current.price,
                newFare: finalFare,
            })

            setFareRecalcFailed(false)
            setFareNote('')
            setPendingFare({
                coords: { lat: coords.lat, lng: coords.lng },
                price,
                discountAmount,
                finalFare,
                couponCode,
            })
        } catch (error) {
            if (requestId !== fareRequestRef.current) return
            console.warn('[PickupFare] recalc failed', {
                fareRequestId: requestId,
                error: formatApiError(error) || error?.message,
            })
            setFareRecalcFailed(true)
            setFareNote('Could not update fare — showing the last confirmed price.')
        } finally {
            if (requestId === fareRequestRef.current) {
                inFlightFareKeyRef.current = null
                setFareRecalculating(false)
            }
        }
    }

    /**
     * Single pickup-movement entry point (map panning with the fixed pin).
     * Inside the 200m circle: keep the fare and drop any pending/in-flight
     * recalculation. Outside: debounce a fresh backend fare request.
     */
    const handlePickupMoved = (coords, { immediate = false } = {}) => {
        updatePickupCoords(coords)

        const origin = originalPickupRef.current
        if (!origin || !dropCoords) return

        const distanceFromOriginalPickupMeters =
            haversineKm(origin.lat, origin.lng, coords.lat, coords.lng) * 1000
        const inside200m = distanceFromOriginalPickupMeters <= PICKUP_FARE_RADIUS_METERS
        const zone = inside200m ? 'inside' : 'outside'

        if (immediate || lastFareZoneRef.current !== zone) {
            console.info('[PickupRadius]', {
                reference: origin,
                current: coords,
                distance: Math.round(distanceFromOriginalPickupMeters),
                within200m: inside200m,
            })
            lastFareZoneRef.current = zone
        }

        if (inside200m) {
            clearTimeout(fareDebounceRef.current)
            /** Back inside the protected area — abandon any staged/unaccepted fare. */
            fareRequestRef.current += 1
            inFlightFareKeyRef.current = null
            setFareRecalculating(false)
            setPendingFare(null)
            setFareRecalcFailed(false)
            setFareNote('')
            return
        }

        clearTimeout(fareDebounceRef.current)
        lastOutsideCoordsRef.current = coords
        if (immediate) {
            requestFareRecalc(coords)
            return
        }
        fareDebounceRef.current = setTimeout(
            () => requestFareRecalc(coords),
            FARE_RECALC_DEBOUNCE_MS
        )
    }

    /**
     * Stable identities for RideMap's move listeners; the latest logic is
     * reached through the ref, so closures never go stale.
     */
    const pickupMovedRef = useRef(null)

    const handleMapCenterChange = useCallback((coords) => {
        pickupMovedRef.current?.(coords)
    }, [])

    const handleMapCenterSettled = useCallback((coords) => {
        pickupMovedRef.current?.(coords, { immediate: true })
        updatePickupAddress(coords)
    }, [updatePickupAddress])

    pickupMovedRef.current = handlePickupMoved

    /**
     * Commits the staged quote: new fare, new pickup coordinates and the
     * confirmed reference — which recenters the 200m circle (reference rule).
     */
    const acceptPendingFare = () => {
        if (!pendingFare) return

        console.info('[PickupConfirm]', {
            accepted: true,
            pickup: pendingFare.coords,
            fare: pendingFare.finalFare,
        })

        /** Drop any in-flight quote — the accepted one is now authoritative. */
        fareRequestRef.current += 1
        inFlightFareKeyRef.current = null
        setFareRecalculating(false)

        setFareState({
            price: pendingFare.price,
            discountAmount: pendingFare.discountAmount,
            finalFare: pendingFare.finalFare,
            couponCode: pendingFare.couponCode,
        })
        originalPickupRef.current = pendingFare.coords
        setOriginalPickup(pendingFare.coords)
        setPickupCoords(pendingFare.coords)
        setPendingFare(null)
        setFareRecalcFailed(false)
        setFareNote('Fare updated based on your new pickup location.')
    }

    /** Manual retry after a failed recalculation for the last outside position. */
    const retryFareRecalc = () => {
        if (fareRecalculating) return
        if (lastOutsideCoordsRef.current) requestFareRecalc(lastOutsideCoordsRef.current)
    }

    const confirmPickup = async () => {
        if (!pickupCoords) {
            setBookingError(t('select_pickup_drop_first'))
            return
        }

        if (booking) return

        setBooking(true)
        setBookingError('')

        try {
            const body = {
                pickupLocation: pickup,
                dropLocation: state.destination,

                pickupLat: pickupCoords.lat,
                pickupLng: pickupCoords.lng,

                ...(dropCoords
                    ? {
                        dropLat: dropCoords.lat,
                        dropLng: dropCoords.lng,
                    }
                    : {}),

                vehicleType: state.vehicleType,

                paymentMethod: state.paymentMethod || 'Cash',

                ...(user?.name
                    ? {
                        customerName: user.name,
                    }
                    : {}),

                ...(user?.phone
                    ? {
                        customerPhone: user.phone,
                    }
                    : {}),

                ...(fareState.couponCode
                    ? {
                        couponCode: fareState.couponCode,
                    }
                    : {}),

                price: fareState.price,
                distanceKm: state.distanceKm,

                /**
                 * Send one absolute UTC instant.
                 */
                ...(state.scheduledAt
                    ? {
                        scheduledAt: new Date(
                            state.scheduledAt
                        ).toISOString(),
                    }
                    : {}),
            }

            console.info(
                '[ride request] POST /rides/create',
                body
            )

            const response = await apiClient.post(
                '/rides/create',
                body,
                withAuth()
            )

            const raw = stripApiEnvelope(response.data)

            /*
             * Dispatch information returned by backend.
             *
             * matched:
             *   Number of eligible drivers matched by backend.
             *
             * delivered:
             *   Number of matched drivers who actually had a live
             *   Socket.IO room and received the ride offer.
             */
            const dispatch = raw?.dispatch || null

            if (dispatch) {
                const matched = Number(dispatch.matched || 0)
                const delivered = Number(dispatch.delivered || 0)

                console.info(
                    '[ride request] created — matched=%d delivered=%d',
                    matched,
                    delivered
                )


                /*
                 * Debug information without exposing authentication
                 * tokens or sensitive credentials.
                 */
                console.info(
                    '[ride request] dispatch summary',
                    {
                        matched,
                        delivered,
                        rideId: raw?.ride?._id || raw?._id || null,
                    }
                )
            } else {
                console.info(
                    '[ride request] no dispatch object returned by backend'
                )
            }

            /*
             * Build ride payload.
             */
            const ridePayload = {
                ...(raw?.ride &&
                typeof raw.ride === 'object'
                    ? raw.ride
                    : raw),
            }

            /*
             * Never expose OTP through navigation state.
             */
            delete ridePayload.otp

            /*
             * A successful HTTP response without a ride ID
             * is not a valid booking.
             */
            if (!ridePayload?._id) {
                setBookingError(
                    'Could not start your ride. Please try again.'
                )
                return
            }

            /*
             * Persist active ride session.
             */
            writeRideSessionId(ridePayload._id)

            /*
             * Scheduled ride:
             *
             * Backend has reserved it but has not started
             * driver searching yet.
             */
            if (
                ridePayload?.status === 'scheduled' ||
                raw?.scheduled === true
            ) {
                setScheduledRide(ridePayload)
                return
            }

            /*
             * Normal immediate ride.
             */
            navigate('/searching-for-driver', {
                replace: true,

                state: {
                    ride: ridePayload,

                    pickupCoords,
                    dropCoords,
                    pickup,
                    destination: state.destination,

                    rideFor: state.rideFor,
                    vehicleType: state.vehicleType,
                    tierId: state.tierId,

                    paymentMethod: state.paymentMethod,
                    price: fareState.price,

                    scheduledAt: state.scheduledAt,
                },
            })
        } catch (error) {
            console.error(
                '[ride request] create ride failed',
                error
            )

            const message = formatApiError(error)

            /*
             * A rejected coupon (already redeemed / expired / ineligible) must not
             * stay attached to the booking: drop it so the retry books at the plain
             * fare instead of resubmitting a code the backend will keep refusing.
             */
            if (
                fareStateRef.current.couponCode &&
                /coupon/i.test(String(message || ''))
            ) {
                setFareState((prev) => ({
                    ...prev,
                    couponCode: '',
                    discountAmount: 0,
                    finalFare: prev.price,
                }))
                setFareNote('')
            }

            setBookingError(message)
        } finally {
            setBooking(false)
        }
    }

    /*
     * Scheduled ride confirmation.
     */
    if (scheduledRide) {
        return (
            <ScheduledRideConfirmation
                ride={scheduledRide}
                pickup={pickup}
                destination={state.destination}
                vehicleType={state.vehicleType}
                onDone={() =>
                    navigate('/home', {
                        replace: true,
                    })
                }
                onViewTrips={() =>
                    navigate('/history', {
                        replace: true,
                    })
                }
            />
        )
    }

    /*
     * Required ride information missing.
     */
    if (!pickupCoords || !dropCoords) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-theme-bg px-8 text-center text-theme-primary">
                <p className="text-sm">
                    {t('ride_details_not_available')}
                </p>

                <button
                    type="button"
                    onClick={() =>
                        navigate('/choose-ride', {
                            replace: true,
                        })
                    }
                    className="rounded-xl border border-brand-yellow bg-brand-yellow px-6 py-3 text-sm font-bold text-black"
                >
                    {t('back_to_home')}
                </button>
            </div>
        )
    }

    /**
     * True while the selected pickup sits outside the confirmed reference's
     * 200m zone without an accepted fare — booking waits for the new fare
     * (backend recalculates and revalidates at ride creation regardless).
     */
    const pickupOutsideReference = Boolean(
        originalPickup
        && pickupCoords
        && haversineKm(
            originalPickup.lat,
            originalPickup.lng,
            pickupCoords.lat,
            pickupCoords.lng,
        ) * 1000 > PICKUP_FARE_RADIUS_METERS
    )

    return (
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-theme-bg text-theme-primary">
            <div className="relative min-h-0 flex-1 overflow-hidden">
                <RideMap
                    pickupCoords={pickupCoords}
                    dropCoords={null}
                    fixedPickupPin
                    pickupCircle={
                        originalPickup
                            ? {
                                lat: originalPickup.lat,
                                lng: originalPickup.lng,
                                radiusMeters: PICKUP_FARE_RADIUS_METERS,
                            }
                            : null
                    }
                    onMapCenterChange={handleMapCenterChange}
                    onMapCenterSettled={handleMapCenterSettled}
                    showRoute={false}
                    showRouteStatsChip={false}
                    zoomControlPosition="topright"
                    zoom={16}
                />

                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    aria-label={t('back')}
                    className="absolute left-4 top-4 z-[1000] flex h-10 w-10 items-center justify-center rounded-full border border-theme bg-theme-bg/90 text-theme-primary shadow-lg backdrop-blur-sm active:scale-95"
                >
                    <i
                        className="ri-arrow-left-line text-lg"
                        aria-hidden
                    />
                </button>
            </div>

            <div className="relative z-10 shrink-0 rounded-t-[28px] border-t border-theme bg-theme-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5 shadow-[0_-8px_40px_rgba(0,0,0,0.45)]">
                <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-theme-card-muted" />

                <h1 className="text-lg font-bold text-theme-primary">
                    Confirm pickup
                </h1>

                <div className="mt-3 rounded-xl border border-theme bg-theme-card-muted p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-theme-muted">
                        {t('pickup')}
                    </p>

                    <p className="mt-1 break-words text-sm font-medium text-theme-primary">
                        {pickup || 'Selected map location'}
                    </p>

                    {locationLoading && (
                        <p className="mt-1 text-xs text-theme-secondary">
                            Updating pickup address...
                        </p>
                    )}

                    {!locationLoading && locationError && (
                        <p className="mt-1 text-xs text-amber-400">
                            {locationError}
                        </p>
                    )}
                </div>

                <div className="mt-3 flex items-center justify-between text-sm text-theme-secondary">
                    <span>
                        {state.vehicleType || 'Ride'}
                    </span>

                    {fareRecalculating ? (
                        <span className="flex items-center gap-2">
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-yellow border-t-transparent" />
                            <span className="text-xs text-theme-secondary">
                                Updating fare…
                            </span>
                        </span>
                    ) : Number(fareState.discountAmount) > 0 ? (
                        <span className="flex items-center gap-2">
                            <span className="text-xs text-theme-muted line-through">
                                {formatPrice(fareState.price)}
                            </span>

                            <span className="font-semibold text-emerald-400">
                                {formatPrice(fareState.finalFare)}
                            </span>
                        </span>
                    ) : (
                        <span className="font-semibold text-theme-primary">
                            {formatPrice(fareState.price)}
                        </span>
                    )}
                </div>

                {fareState.couponCode &&
                    Number(fareState.discountAmount) > 0 && (
                        <p className="mt-1 text-xs text-emerald-400">
                            {fareState.couponCode} applied · −
                            {formatPrice(
                                fareState.discountAmount
                            )}
                        </p>
                    )}

                {!fareRecalculating && fareNote && (
                    <p className="mt-1 text-xs text-theme-secondary">
                        {fareNote}
                        {fareRecalcFailed && pickupOutsideReference && (
                            <>
                                {' '}
                                <button
                                    type="button"
                                    onClick={retryFareRecalc}
                                    className="font-semibold text-brand-yellow underline"
                                >
                                    Retry
                                </button>
                            </>
                        )}
                    </p>
                )}

                {pendingFare && (
                    <div className="mt-3 rounded-xl border border-theme bg-theme-card-muted p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-brand-yellow">
                            Confirm new fare
                        </p>

                        <p className="mt-1 text-xs text-theme-secondary">
                            Your total fare was updated to reflect your new pickup point.
                        </p>

                        <p className="mt-1 text-base font-bold text-theme-primary">
                            {formatPrice(pendingFare.finalFare)}
                            {Number(pendingFare.discountAmount) > 0 && (
                                <span className="ml-2 text-xs font-medium text-theme-muted line-through">
                                    {formatPrice(pendingFare.price)}
                                </span>
                            )}
                        </p>
                    </div>
                )}

                {bookingError && (
                    <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                        {bookingError}
                    </p>
                )}

                {pendingFare ? (
                    <button
                        type="button"
                        onClick={acceptPendingFare}
                        className="mt-4 w-full rounded-2xl bg-brand-yellow px-4 py-3.5 text-sm font-bold text-black transition active:scale-[0.99]"
                    >
                        Accept fare
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={confirmPickup}
                        disabled={booking || pickupOutsideReference}
                        className="mt-4 w-full rounded-2xl bg-brand-yellow px-4 py-3.5 text-sm font-bold text-black transition active:scale-[0.99] disabled:opacity-50"
                    >
                        {booking
                            ? t('booking_ride_dots')
                            : 'Confirm pickup'}
                    </button>
                )}
            </div>
        </div>
    )
}