import React, { useState, useContext } from 'react'
import { UserDataContext } from '../context/UserContext'
import Payment from './Payment'
import axios from 'axios'
import { API_BASE_URL } from '../config/apiBaseUrl'

function passengerVehicleLabel (vehicleType) {
    const t = String(vehicleType || '').toUpperCase()
    if (t === 'BIKE') return 'Bike'
    if (t === 'AUTO') return 'Auto'
    if (t === 'CAR' || t === 'MINI' || t === 'SEDAN') return 'Cab'
    return t || '—'
}

function passengerVehicleIconClass (vehicleType) {
    const t = String(vehicleType || '').toUpperCase()
    if (t === 'BIKE') return 'ri-motorbike-line'
    if (t === 'AUTO') return 'ri-taxi-line'
    if (t === 'CAR' || t === 'MINI' || t === 'SEDAN') return 'ri-car-line'
    return 'ri-roadster-line'
}

const ConfirmRide = (props) => {
    const { user } = useContext(UserDataContext)
    const [paymentMethod, setPaymentMethod] = useState(props.paymentMethod || 'Cash')

    const vehicleType = props.vehicleType || 'AUTO'
    const fare = props.fare || {}
    const u = String(vehicleType).toUpperCase()
    const vehicleTypeNorm = u === 'MINI' || u === 'SEDAN' ? 'CAR' : ([ 'BIKE', 'AUTO', 'CAR' ].includes(u) ? u : 'AUTO')
    const priceRaw = fare[vehicleTypeNorm] ?? fare[vehicleType] ?? fare.price
    const price = Number.isFinite(Number(priceRaw)) && Number(priceRaw) > 0 ? Number(priceRaw) : null

    const isUpiLike = paymentMethod === 'UPI' || paymentMethod === 'Online'

    const handleConfirm = async (paymentMeta = {}) => {
        if (isUpiLike && !paymentMeta?.paymentAttempted) {
            alert('Complete UPI / online payment first, or use QR + Confirm on desktop.')
            return
        }
        props.setVehicleFound(true)
        props.setConfirmRidePanel(false)
        const createdRide = await props.createRide({
            paymentMethod,
            customerName: user?.name,
            customerPhone: user?.phone
        })
        if (isUpiLike && createdRide?._id) {
            try {
                const token = localStorage.getItem('token')
                await axios.post(`${API_BASE_URL}/rides/upi/verify`, {
                    rideId: createdRide._id,
                    transactionRef: paymentMeta.transactionRef || `txn_${Date.now()}`,
                    status: paymentMeta.status || 'PENDING',
                    amount: paymentMeta.amount || price,
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            } catch {
                /* UPI verify is best-effort; ride already created */
            }
        }
    }

    return (
        <div className="text-zinc-100">
            <h5 className="p-1 text-center w-[93%] absolute top-0 cursor-pointer" onClick={() => props.setConfirmRidePanel(false)}>
                <i className="text-3xl text-zinc-500 ri-arrow-down-wide-line"></i>
            </h5>
            <h3 className="text-2xl font-semibold mb-4 text-white">Confirm your ride</h3>

            <div className="w-full space-y-0 rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/50">
                <div className="flex items-center gap-3 p-3 border-b border-zinc-800">
                    <i className="ri-map-pin-user-fill text-emerald-500"></i>
                    <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Pickup</p>
                        <p className="font-medium text-zinc-100 break-words">{props.pickup}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 p-3 border-b border-zinc-800">
                    <i className="ri-map-pin-2-fill text-emerald-500"></i>
                    <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Drop</p>
                        <p className="font-medium text-zinc-100 break-words">{props.destination}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 p-3 border-b border-zinc-800">
                    <i className={`${passengerVehicleIconClass(vehicleType)} text-xl text-emerald-500`} />
                    <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Ride type</p>
                        <p className="font-medium text-zinc-100">{passengerVehicleLabel(vehicleType)}</p>
                    </div>
                </div>
                {fare.distanceKm != null && (
                    <div className="flex items-center gap-3 p-3 border-b border-zinc-800">
                        <i className="ri-roadster-line text-emerald-500"></i>
                        <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Distance</p>
                            <p className="font-medium text-zinc-100">{fare.distanceKm} km</p>
                        </div>
                    </div>
                )}
                <div className="flex items-center gap-3 p-3 border-b border-zinc-800">
                    <i className="ri-currency-line text-emerald-500"></i>
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total fare</p>
                        <p className="text-lg font-semibold text-zinc-100">{price != null ? `₹${price}` : 'Fare unavailable'}</p>
                    </div>
                </div>

                {price != null ? (
                    <Payment
                        amount={price}
                        method={paymentMethod}
                        onMethodChange={setPaymentMethod}
                        onContinue={handleConfirm}
                    />
                ) : null}
            </div>
        </div>
    )
}

export default ConfirmRide
