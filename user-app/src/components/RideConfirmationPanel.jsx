import React from 'react'
import { useLanguage } from '../i18n'
import RideStatusStepper from './RideStatusStepper'
import RideMap from './RideMap'

/**
 * Passenger ride confirmation: driver + vehicle + fare + OTP + ETA (from `confirmation` API/socket DTO).
 */
export default function RideConfirmationPanel ({
  ride,
  confirmation,
  passengerOtp,
  driverCoords,
  pickupCoords,
  dropCoords,
  onCloseWaiting,
}) {
  const { t } = useLanguage()
  const c = confirmation || {}
  const captain = ride?.captain
  const name = c.driverName || captain?.name || t('your_driver')
  const phone = c.driverPhone || captain?.phone || '—'
  const rating = c.driverRating != null ? Number(c.driverRating) : null
  const vType = c.vehicleType || ride?.vehicleType || '—'
  const vNum = c.vehicleNumber || '—'
  const vModel = c.vehicleModel || vType
  const fare = c.fare != null ? c.fare : ride?.price
  const status = c.rideStatus || ride?.status || 'accepted'
  const otp = (passengerOtp && String(passengerOtp).trim()) || (c.otp && String(c.otp).trim()) || ''
  const etaText =
    c.etaMinutes != null && Number.isFinite(Number(c.etaMinutes))
      ? `${c.etaMinutes} min`
      : (c.eta || null)

  const live = c.liveLocation
    || (driverCoords?.lat != null ? { lat: driverCoords.lat, lng: driverCoords.lng } : null)

  return (
    <div className="min-w-0 text-theme-primary">
      <h5
        className="p-1 text-center w-[93%] absolute top-0 cursor-pointer"
        onClick={() => onCloseWaiting?.(false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onCloseWaiting?.(false)}
      >
        <i className="text-3xl text-theme-muted ri-arrow-down-wide-line" />
      </h5>

      <div className="mb-4">
        <RideStatusStepper status={status === 'searching' ? 'accepted' : status} />
      </div>

      {(pickupCoords || dropCoords || live) && (
        <div className="mb-4 h-[30dvh] min-h-[210px] w-full shrink-0 overflow-hidden rounded-xl border border-theme bg-theme-card-muted">
          <RideMap
            pickupCoords={pickupCoords}
            dropCoords={dropCoords}
            driverCoords={live}
            showRoute={Boolean(pickupCoords && dropCoords)}
            trackingFrom={live?.lat != null && pickupCoords?.lat != null ? live : null}
            trackingTo={live?.lat != null && pickupCoords?.lat != null ? pickupCoords : null}
            showRouteStatsChip={false}
            showTrackingEta={false}
            zoomControlPosition="bottomleft"
          />
        </div>
      )}

      {status === 'accepted' && (
        <div className="mb-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-emerald-800 text-sm">
          {t('driver_assigned_instructions')}
        </div>
      )}
      {status === 'arrived' && (
        <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900 text-sm">
          {t('driver_arrived_instructions')}
        </div>
      )}

      <div className="rounded-xl border border-theme bg-theme-card-muted p-4 mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-theme-muted mb-2">{t('driver')}</p>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold capitalize">{name}</h2>
            <p className="text-sm text-theme-muted">{phone}</p>
            {rating != null && Number.isFinite(rating) ? (
              <p className="text-sm text-amber-700 mt-1">
                <i className="ri-star-fill" /> {rating.toFixed(1)}
              </p>
            ) : null}
          </div>
          <div className="text-right text-sm">
            <p className="font-medium text-theme-primary">{vModel}</p>
            <p className="text-theme-muted">{vType}</p>
            <p className="font-mono font-semibold mt-1">{vNum}</p>
          </div>
        </div>
        {(etaText || live) && (
          <div className="mt-3 pt-3 border-t border-theme text-sm text-theme-secondary flex flex-wrap gap-x-4 gap-y-1">
            {etaText ? <span>{t('eta_to_pickup')} <strong>{etaText}</strong></span> : null}
            {live?.lat != null && live?.lng != null ? (
              <span className="text-xs text-theme-muted">{t('live_gps_updating')}</span>
            ) : null}
          </div>
        )}
      </div>

      <div className="mb-4 rounded-xl border-2 border-theme-strong bg-theme-card-muted px-4 py-3 text-center shadow-md">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">{t('your_ride_otp')}</p>
        <p
          className={`mt-1 font-mono text-3xl font-bold tracking-[0.2em] select-all ${otp ? 'text-theme-primary' : 'text-theme-muted'}`}
          title={otp ? t('otp_share_instruction') : ''}
        >
          {otp || t('loading_otp')}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 p-3 border-b border-theme">
          <i className="ri-map-pin-user-fill text-xl text-emerald-600" />
          <div>
            <h3 className="text-base font-medium">{t('pickup')}</h3>
            <p className="text-sm text-theme-muted">{ride?.pickupLocation || ride?.pickup}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 border-b border-theme">
          <i className="ri-map-pin-2-fill text-xl text-rose-600" />
          <div>
            <h3 className="text-base font-medium">{t('drop')}</h3>
            <p className="text-sm text-theme-muted">{ride?.dropLocation || ride?.destination}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3">
          <i className="ri-currency-line text-xl text-theme-secondary" />
          <div>
            <h3 className="text-lg font-semibold">₹{fare ?? '—'}</h3>
            <p className="text-sm text-theme-muted">{ride?.paymentMethod || 'Cash'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
