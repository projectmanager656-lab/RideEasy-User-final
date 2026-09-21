import React, { useCallback, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import RideMap from '../components/RideMap'
import { apiClient, withAuth } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'
import { formatApiError } from '../utils/apiError'
import { useLanguage } from '../i18n'
import { useUserData } from '../context/UserContext'

const USER_RIDE_SESSION_KEY = 'rideeasy_user_ride'

function normalizeCoordinates (value) {
    if (!value || typeof value !== 'object') return null
    const lat = Number(value.lat ?? value.latitude)
    const lng = Number(value.lng ?? value.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
}

function formatPrice (value) {
    const amount = Number(value)
    return Number.isFinite(amount) && amount > 0 ? `₹${amount.toFixed(2)}` : '—'
}

export default function ConfirmPickup () {
    const navigate = useNavigate()
    const location = useLocation()
    const { t } = useLanguage()
    const { user } = useUserData()
    const state = location.state || {}
    const initialPickupCoords = normalizeCoordinates(state.pickupCoords)
    const dropCoords = normalizeCoordinates(state.dropCoords)
    const [pickupCoords, setPickupCoords] = useState(initialPickupCoords)
    const [pickup, setPickup] = useState(state.pickup || '')
    const [locationLoading, setLocationLoading] = useState(false)
    const [locationError, setLocationError] = useState('')
    const [booking, setBooking] = useState(false)
    const [bookingError, setBookingError] = useState('')
    const geocodeRequestRef = useRef(0)

    const updatePickupCoords = useCallback((coords) => {
        setPickupCoords(coords)
    }, [])

    const updatePickupAddress = useCallback(async (coords) => {
        setLocationLoading(true)
        setLocationError('')
        const requestId = ++geocodeRequestRef.current
        try {
            const response = await apiClient.get('/maps/get-address', withAuth({
                params: { lat: coords.lat, lng: coords.lng },
            }))
            if (requestId !== geocodeRequestRef.current) return
            const address = response.data?.address
            if (address) setPickup(address)
            else setLocationError('Pickup address is unavailable. The selected map location will still be used.')
        } catch (error) {
            if (requestId === geocodeRequestRef.current) {
                setLocationError(formatApiError(error) || 'Pickup address is unavailable. The selected map location will still be used.')
            }
        } finally {
            if (requestId === geocodeRequestRef.current) setLocationLoading(false)
        }
    }, [])

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
                ...(dropCoords ? { dropLat: dropCoords.lat, dropLng: dropCoords.lng } : {}),
                vehicleType: state.vehicleType,
                paymentMethod: state.paymentMethod || 'Cash',
                ...(user?.name ? { customerName: user.name } : {}),
                ...(user?.phone ? { customerPhone: user.phone } : {}),
                ...(state.couponCode ? { couponCode: state.couponCode } : {}),
                price: state.price,
                distanceKm: state.distanceKm,
                ...(state.scheduledAt ? { scheduledAt: state.scheduledAt } : {}),
            }
            console.info('[ride request] POST /rides/create', body)
            const response = await apiClient.post('/rides/create', body, withAuth())
            const raw = stripApiEnvelope(response.data)
            const dispatch = raw?.dispatch || null
            if (dispatch) {
                console.info('[ride request] created — matched=%d delivered=%d', dispatch.matched, dispatch.delivered)
                if (Number(dispatch.delivered) === 0) {
                    console.warn('[ride request] no driver received the offer over the socket (matched=%d) — drivers can still pick it up from the /rides/pending poll', dispatch.matched)
                }
            }
            const ridePayload = { ...(raw?.ride && typeof raw.ride === 'object' ? raw.ride : raw) }
            delete ridePayload.otp
            if (ridePayload?._id) {
                try {
                    sessionStorage.setItem(USER_RIDE_SESSION_KEY, String(ridePayload._id))
                } catch { /* ignore */ }
            }
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
                    price: state.price,
                    scheduledAt: state.scheduledAt,
                },
            })
        } catch (error) {
            setBookingError(formatApiError(error))
        } finally {
            setBooking(false)
        }
    }

    if (!pickupCoords || !dropCoords) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-theme-bg px-8 text-center text-theme-primary">
                <p className="text-sm">{t('ride_details_not_available')}</p>
                <button type="button" onClick={() => navigate('/choose-ride', { replace: true })} className="rounded-xl border border-brand-yellow bg-brand-yellow px-6 py-3 text-sm font-bold text-black">
                    {t('back_to_home')}
                </button>
            </div>
        )
    }

    return (
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-theme-bg text-theme-primary">
            <div className="relative min-h-0 flex-1 overflow-hidden">
                <RideMap
                    pickupCoords={pickupCoords}
                    dropCoords={null}
                    fixedPickupPin
                    onMapCenterChange={updatePickupCoords}
                    onMapCenterSettled={updatePickupAddress}
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
                    <i className="ri-arrow-left-line text-lg" aria-hidden />
                </button>
            </div>

            <div className="relative z-10 shrink-0 rounded-t-[28px] border-t border-theme bg-theme-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5 shadow-[0_-8px_40px_rgba(0,0,0,0.45)]">
                <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-theme-card-muted" />
                <h1 className="text-lg font-bold text-theme-primary">Confirm pickup</h1>
                <div className="mt-3 rounded-xl border border-theme bg-theme-card-muted p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-theme-muted">{t('pickup')}</p>
                    <p className="mt-1 break-words text-sm font-medium text-theme-primary">{pickup || 'Selected map location'}</p>
                    {locationLoading && <p className="mt-1 text-xs text-theme-secondary">Updating pickup address...</p>}
                    {!locationLoading && locationError && <p className="mt-1 text-xs text-amber-400">{locationError}</p>}
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-theme-secondary">
                    <span>{state.vehicleType || 'Ride'}</span>
                    {Number(state.discountAmount) > 0 ? (
                        <span className="flex items-center gap-2">
                            <span className="text-xs text-theme-muted line-through">{formatPrice(state.price)}</span>
                            <span className="font-semibold text-emerald-400">{formatPrice(state.finalFare)}</span>
                        </span>
                    ) : (
                        <span className="font-semibold text-theme-primary">{formatPrice(state.price)}</span>
                    )}
                </div>
                {state.couponCode && Number(state.discountAmount) > 0 && (
                    <p className="mt-1 text-xs text-emerald-400">{state.couponCode} applied · −{formatPrice(state.discountAmount)}</p>
                )}
                {bookingError && <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{bookingError}</p>}
                <button
                    type="button"
                    onClick={confirmPickup}
                    disabled={booking}
                    className="mt-4 w-full rounded-2xl bg-brand-yellow px-4 py-3.5 text-sm font-bold text-black transition active:scale-[0.99] disabled:opacity-50"
                >
                    {booking ? t('booking_ride_dots') : 'Confirm pickup'}
                </button>
            </div>
        </div>
    )
}
