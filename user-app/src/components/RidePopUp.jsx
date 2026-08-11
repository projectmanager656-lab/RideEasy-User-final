import React from 'react'
import { getExternalMapsDirBase, getPlaceholderAvatarUrl } from '../config/externalEndpoints'

const RidePopUp = (props) => {
    return (
        <div>
            <h5 className='p-1 text-center w-[93%] absolute top-0' onClick={() => {
                props.setRidePopupPanel(false)
            }}><i className="text-3xl text-gray-200 ri-arrow-down-wide-line"></i></h5>
            <h3 className='text-2xl font-semibold mb-5'>New Ride Available!</h3>
            <div className='flex items-center justify-between p-3 bg-yellow-400 rounded-lg mt-4'>
                <div className='flex items-center gap-3 '>
                    <img className='h-12 rounded-full object-cover w-12' src={getPlaceholderAvatarUrl()} alt="" />
                    <h2 className='text-lg font-medium'>{props.ride?.user?.name || props.ride?.user?.fullname?.firstname}</h2>
                </div>
                <h5 className='text-lg font-semibold'>{props.ride?.distance ?? '—'} km</h5>
            </div>
            <div className='flex gap-2 justify-between flex-col items-center'>
                <div className='w-full mt-5'>
                    <div className='flex items-center gap-5 p-3 border-b-2'>
                        <i className="ri-map-pin-user-fill"></i>
                        <div>
                            <p className='text-sm -mt-1 text-gray-600'>{props.ride?.pickupLocation || props.ride?.pickup}</p>
                        </div>
                    </div>
                    <div className='flex items-center gap-5 p-3 border-b-2'>
                        <i className="text-lg ri-map-pin-2-fill"></i>
                        <div>
                            <p className='text-sm -mt-1 text-gray-600'>{props.ride?.dropLocation || props.ride?.destination}</p>
                        </div>
                    </div>
                    <div className='flex items-center gap-5 p-3'>
                        <i className="ri-currency-line"></i>
                        <div>
                            <h3 className='text-lg font-medium'>₹{props.ride?.price ?? props.ride?.fare} </h3>
                            <p className='text-sm -mt-1 text-gray-600'>{props.ride?.paymentMethod || 'Cash'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-5 px-3 pb-3">
                        <i className="ri-navigation-line" />
                        <button
                            type="button"
                            className="text-sm text-emerald-700 underline"
                            onClick={() => {
                                const pickup = props.ride?.pickupLocation || props.ride?.pickup;
                                if (!pickup) return;
                                const mapsUrl = `${getExternalMapsDirBase()}/?api=1&destination=${encodeURIComponent(pickup)}`;
                                window.open(mapsUrl, '_blank');
                            }}
                        >
                            Open navigation to pickup
                        </button>
                    </div>
                </div>
                <div className='mt-5 w-full '>
                    <button type="button" onClick={() => props.confirmRide && props.confirmRide()} className=' bg-green-600 w-full text-white font-semibold p-2 px-10 rounded-lg'>Accept</button>

                    <button type="button" onClick={() => props.onReject ? props.onReject() : props.setRidePopupPanel(false)} className='mt-2 w-full bg-gray-300 text-gray-700 font-semibold p-2 px-10 rounded-lg'>Reject</button>


                </div>
            </div>
        </div>
    )
}

export default RidePopUp