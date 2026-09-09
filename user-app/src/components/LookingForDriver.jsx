import React from 'react'
import RideStatusStepper from './RideStatusStepper'
import { tierFare } from '../constants/rideTiers'
import { useLanguage } from '../i18n'

function rideStatusNorm(s) {
    return String(s || '').trim().toLowerCase()
}

const LookingForDriver = (props) => {
    const { t } = useLanguage()
    const st = rideStatusNorm(props.ride?.status)
    const isSearching = !st || st === 'searching'
    const isArrived = st === 'arrived'
    /** OTP is shown to the passenger ONLY once the driver has arrived (never while searching or assigned). */
    const showOtp = isArrived && Boolean(props.passengerOtp)

    return (
        <div>
            <h5 className='p-1 text-center w-[93%] absolute top-0' onClick={() => {
                props.setVehicleFound(false)
            }}><i className="text-3xl text-theme-secondary ri-arrow-down-wide-line"></i></h5>
            <h3 className='text-2xl font-semibold mb-5 text-theme-primary'>{t('looking_for_driver_title')}</h3>
            <div className="mb-4">
                <RideStatusStepper status="searching" />
            </div>

            {isSearching && (
                <div className="mb-4 rounded-xl border border-theme bg-theme-card-muted px-3 py-2 text-sm text-theme-primary">
                    {t('notify_drivers_a')}<strong className="text-theme-primary">{t('six_digit_otp')}</strong>{t('notify_drivers_b')}<strong className="text-theme-primary">{t('after_driver_accepts')}</strong>{t('notify_drivers_c')}
                </div>
            )}

            {isSearching && props.assignmentError && (
                <div className="mb-4 rounded-xl border border-brand-yellow/40 bg-brand-yellow/10 px-3 py-2 text-sm text-brand-yellow">
                    {props.assignmentError}
                </div>
            )}

            {showOtp ? (
            <div className="mb-4 rounded-xl border-2 border-theme bg-theme-card-muted px-4 py-3 text-center shadow-md">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-secondary">{t('your_ride_otp')}</p>
                <p
                    className={`mt-1 text-lg font-semibold leading-snug select-all ${props.passengerOtp ? 'font-mono text-3xl font-bold tracking-[0.2em] text-theme-primary' : 'text-theme-secondary'}`}
                    title={props.passengerOtp ? t('otp_share_instruction') : t('loading_otp')}
                >
                    {props.passengerOtp || '—'}
                </p>
            </div>
            ) : null}

            <div className='flex gap-2 justify-between flex-col items-center'>
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-theme-card-muted text-4xl text-theme-primary" aria-hidden>
                    <i className="ri-car-line" />
                </div>
                <div className='w-full mt-5 rounded-xl border border-theme overflow-hidden'>
                    <div className='flex items-center gap-5 p-3 border-b border-theme'>
                        <i className="ri-map-pin-user-fill text-emerald-400"></i>
                        <div className="min-w-0 flex-1">
                            <h3 className='text-lg font-medium text-theme-primary'>{t('pickup')}</h3>
                            <p className='text-sm -mt-1 text-theme-secondary break-words'>
                                {props.pickup || props.ride?.pickupLocation || '—'}
                            </p>
                        </div>
                    </div>
                    <div className='flex items-center gap-5 p-3 border-b border-theme'>
                        <i className="text-lg ri-map-pin-2-fill text-emerald-400"></i>
                        <div className="min-w-0 flex-1">
                            <h3 className='text-lg font-medium text-theme-primary'>{t('drop_off')}</h3>
                            <p className='text-sm -mt-1 text-theme-secondary break-words'>
                                {props.destination || props.ride?.dropLocation || '—'}
                            </p>
                        </div>
                    </div>
                    <div className='flex items-center gap-5 p-3'>
                        <i className="ri-currency-line text-emerald-400"></i>
                        <div>
                            <h3 className='text-lg font-medium text-theme-primary'>
                                ₹{props.ride?.price ?? props.fare?.[props.vehicleType] ?? tierFare(props.vehicleType) ?? props.fare?.price ?? '—'}
                            </h3>
                            <p className='text-sm -mt-1 text-theme-secondary'>{t('payment_at_end')}</p>
                        </div>
                    </div>
                </div>
                {isSearching && typeof props.onEditLocations === 'function' ? (
                    <button
                        type="button"
                        className="mt-4 w-full rounded-xl border border-theme bg-theme-card py-3 text-sm font-semibold text-theme-primary hover:bg-theme-card-muted"
                        onClick={() => props.onEditLocations()}
                    >
                        {t('edit_locations_search_again')}
                    </button>
                ) : null}
            </div>
        </div>
    )
}

export default LookingForDriver