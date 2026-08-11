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
            }}><i className="text-3xl text-gray-200 ri-arrow-down-wide-line"></i></h5>
            <h3 className='text-2xl font-semibold mb-5'>Looking for a Driver</h3>
            <div className="mb-4">
                <RideStatusStepper status="searching" />
            </div>

            {isSearching && (
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    Drivers nearby are being notified. Your <strong>6-digit OTP</strong> will show here only <strong>after a driver accepts</strong> — share it when they arrive to start the ride.
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
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 text-4xl text-slate-500" aria-hidden>
                    <i className="ri-car-line" />
                </div>
                <div className='w-full mt-5'>
                    <div className='flex items-center gap-5 p-3 border-b-2'>
                        <i className="ri-map-pin-user-fill"></i>
                        <div>
                            <h3 className='text-lg font-medium'>Pickup</h3>
                            <p className='text-sm -mt-1 text-gray-600'>{props.pickup}</p>
                        </div>
                    </div>
                    <div className='flex items-center gap-5 p-3 border-b-2'>
                        <i className="text-lg ri-map-pin-2-fill"></i>
                        <div>
                            <h3 className='text-lg font-medium'>Drop-off</h3>
                            <p className='text-sm -mt-1 text-gray-600'>{props.destination}</p>
                        </div>
                    </div>
                    <div className='flex items-center gap-5 p-3'>
                        <i className="ri-currency-line"></i>
                        <div>
                            <h3 className='text-lg font-medium'>₹{props.fare?.[props.vehicleType] ?? props.fare?.price ?? '—'} </h3>
                            <p className='text-sm -mt-1 text-gray-600'>Payment at end</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default LookingForDriver