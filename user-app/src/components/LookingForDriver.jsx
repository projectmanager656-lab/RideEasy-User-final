import React from 'react'
import RideStatusStepper from './RideStatusStepper'

function rideStatusNorm(s) {
    return String(s || '').trim().toLowerCase()
}

const LookingForDriver = (props) => {
    const st = rideStatusNorm(props.ride?.status)
    const isSearching = !st || st === 'searching'
    const showOtp =
        Boolean(props.passengerOtp)
        || st === 'accepted'
        || st === 'arrived'

    return (
        <div>
            <h5 className='p-1 text-center w-[93%] absolute top-0' onClick={() => {
                props.setVehicleFound(false)
            }}><i className="text-3xl text-zinc-400 ri-arrow-down-wide-line"></i></h5>
            <h3 className='text-2xl font-semibold mb-5 text-white'>Looking for a Driver</h3>
            <div className="mb-4">
                <RideStatusStepper status="searching" />
            </div>

            {isSearching && (
                <div className="mb-4 rounded-xl border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200">
                    Drivers nearby are being notified. Your <strong className="text-white">6-digit OTP</strong> will show here only <strong className="text-white">after a driver accepts</strong> — share it when they arrive to start the ride.
                </div>
            )}

            {showOtp ? (
            <div className="mb-4 rounded-xl border-2 border-slate-800 bg-slate-900 px-4 py-3 text-center shadow-md">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Your ride OTP</p>
                <p
                    className={`mt-1 text-lg font-semibold leading-snug select-all ${props.passengerOtp ? 'font-mono text-3xl font-bold tracking-[0.2em] text-white' : 'text-slate-400'}`}
                    title={props.passengerOtp ? 'Share this code with your driver to start the ride' : 'Loading OTP…'}
                >
                    {props.passengerOtp || (st === 'accepted' || st === 'arrived' ? 'Loading OTP…' : '—')}
                </p>
            </div>
            ) : null}

            <div className='flex gap-2 justify-between flex-col items-center'>
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-800 text-4xl text-zinc-300" aria-hidden>
                    <i className="ri-car-line" />
                </div>
                <div className='w-full mt-5 rounded-xl border border-zinc-800 overflow-hidden'>
                    <div className='flex items-center gap-5 p-3 border-b border-zinc-800'>
                        <i className="ri-map-pin-user-fill text-emerald-400"></i>
                        <div className="min-w-0 flex-1">
                            <h3 className='text-lg font-medium text-white'>Pickup</h3>
                            <p className='text-sm -mt-1 text-zinc-400 break-words'>
                                {props.pickup || props.ride?.pickupLocation || '—'}
                            </p>
                        </div>
                    </div>
                    <div className='flex items-center gap-5 p-3 border-b border-zinc-800'>
                        <i className="text-lg ri-map-pin-2-fill text-emerald-400"></i>
                        <div className="min-w-0 flex-1">
                            <h3 className='text-lg font-medium text-white'>Drop-off</h3>
                            <p className='text-sm -mt-1 text-zinc-400 break-words'>
                                {props.destination || props.ride?.dropLocation || '—'}
                            </p>
                        </div>
                    </div>
                    <div className='flex items-center gap-5 p-3'>
                        <i className="ri-currency-line text-emerald-400"></i>
                        <div>
                            <h3 className='text-lg font-medium text-white'>
                                ₹{props.ride?.price ?? props.fare?.[props.vehicleType] ?? props.fare?.price ?? '—'}
                            </h3>
                            <p className='text-sm -mt-1 text-zinc-400'>Payment at end</p>
                        </div>
                    </div>
                </div>
                {isSearching && typeof props.onEditLocations === 'function' ? (
                    <button
                        type="button"
                        className="mt-4 w-full rounded-xl border border-zinc-600 bg-zinc-900 py-3 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
                        onClick={() => props.onEditLocations()}
                    >
                        Edit pickup &amp; drop — search again
                    </button>
                ) : null}
            </div>
        </div>
    )
}

export default LookingForDriver