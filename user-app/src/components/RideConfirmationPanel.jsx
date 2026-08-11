import React from 'react'
import RideStatusStepper from './RideStatusStepper'

/**
 * Passenger ride confirmation: driver + vehicle + fare + OTP + ETA (from `confirmation` API/socket DTO).
 */
export default function RideConfirmationPanel ({
  ride,
  confirmation,
  passengerOtp,
  driverCoords,
  pickupCoords: _pickupCoords,
  onCloseWaiting,
}) {
  const c = confirmation || {}
  const captain = ride?.captain
  const name = c.driverName || captain?.name || 'Your driver'
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
    <div className="text-slate-900">
      <h5
        className="p-1 text-center w-[93%] absolute top-0 cursor-pointer"
        onClick={() => onCloseWaiting?.(false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onCloseWaiting?.(false)}
      >
        <i className="text-3xl text-gray-200 ri-arrow-down-wide-line" />
      </h5>

      <div className="mb-4">
        <RideStatusStepper status={status === 'searching' ? 'accepted' : status} />
      </div>

      {status === 'accepted' && (
        <div className="mb-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-emerald-800 text-sm">
          Driver assigned. Track live location on the map. Share OTP only when the driver arrives.
        </div>
      )}
      {status === 'arrived' && (
        <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900 text-sm">
          Driver has arrived. Share your OTP to start the ride.
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Driver</p>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold capitalize">{name}</h2>
            <p className="text-sm text-slate-600">{phone}</p>
            {rating != null && Number.isFinite(rating) ? (
              <p className="text-sm text-amber-700 mt-1">
                <i className="ri-star-fill" /> {rating.toFixed(1)}
              </p>
            ) : null}
          </div>
          <div className="text-right text-sm">
            <p className="font-medium text-slate-800">{vModel}</p>
            <p className="text-slate-600">{vType}</p>
            <p className="font-mono font-semibold mt-1">{vNum}</p>
          </div>
        </div>
        {(etaText || live) && (
          <div className="mt-3 pt-3 border-t border-slate-200 text-sm text-slate-700 flex flex-wrap gap-x-4 gap-y-1">
            {etaText ? <span>ETA to pickup: <strong>{etaText}</strong></span> : null}
            {live?.lat != null && live?.lng != null ? (
              <span className="text-xs text-slate-500">Live GPS updating on map</span>
            ) : null}
          </div>
        )}
      </div>

      <div className="mb-4 rounded-xl border-2 border-slate-900 bg-slate-900 px-4 py-3 text-center shadow-md">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Your ride OTP</p>
        <p
          className={`mt-1 font-mono text-3xl font-bold tracking-[0.2em] select-all ${otp ? 'text-white' : 'text-slate-500'}`}
          title={otp ? 'Share this code with your driver to start the ride' : ''}
        >
          {otp || 'Loading OTP…'}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 p-3 border-b border-slate-200">
          <i className="ri-map-pin-user-fill text-xl text-emerald-600" />
          <div>
            <h3 className="text-base font-medium">Pickup</h3>
            <p className="text-sm text-slate-600">{ride?.pickupLocation || ride?.pickup}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 border-b border-slate-200">
          <i className="ri-map-pin-2-fill text-xl text-rose-600" />
          <div>
            <h3 className="text-base font-medium">Drop</h3>
            <p className="text-sm text-slate-600">{ride?.dropLocation || ride?.destination}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3">
          <i className="ri-currency-line text-xl text-slate-700" />
          <div>
            <h3 className="text-lg font-semibold">₹{fare ?? '—'}</h3>
            <p className="text-sm text-slate-600">{ride?.paymentMethod || 'Cash'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
