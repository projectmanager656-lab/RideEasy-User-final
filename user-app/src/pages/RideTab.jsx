import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const USER_RIDE_SESSION_KEY = 'rideeasy_user_ride'

const RideTab = () => {
    const navigate = useNavigate()
    const [activeRide] = useState(() => {
        try {
            return sessionStorage.getItem(USER_RIDE_SESSION_KEY) || null
        } catch {
            return null
        }
    })

    return (
        <div className="flex min-h-full flex-col px-4 pt-4">
            <h1 className="text-lg font-bold text-white">Ride</h1>
            <p className="text-[11px] text-zinc-500">Your current ride</p>

            <div className="mt-5 rounded-2xl border border-brand-border bg-brand-cardSoft p-5 text-center">
                {activeRide ? (
                    <>
                        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-yellow/10 text-brand-yellow">
                            <svg
                                className="h-6 w-6 animate-pulse"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                            >
                                <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" />
                                <path d="M3 11h18v3a1 1 0 0 1-1 1h-1v4h-2v-4H7v4H5v-4H4a1 1 0 0 1-1-1v-3Z" />
                            </svg>
                        </span>
                        <h2 className="text-sm font-semibold text-white">You have an active ride</h2>
                        <p className="mt-1 text-xs text-zinc-500">
                            Track your captain and live trip details.
                        </p>
                        <button
                            type="button"
                            onClick={() => navigate('/riding')}
                            className="mt-4 w-full rounded-xl border border-brand-yellow bg-brand-yellow py-3 text-sm font-bold text-black transition active:scale-[0.98]"
                        >
                            Open Live Ride
                        </button>
                    </>
                ) : (
                    <>
                        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-brand-border bg-brand-card text-zinc-500">
                            <svg
                                className="h-6 w-6"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                            >
                                <circle cx="12" cy="12" r="9" />
                                <path d="M12 7v5l3 2" />
                            </svg>
                        </span>
                        <h2 className="text-sm font-semibold text-white">No active ride</h2>
                        <p className="mt-1 text-xs text-zinc-500">
                            Book a ride to see live tracking here.
                        </p>
                        <button
                            type="button"
                            onClick={() => navigate('/home')}
                            className="mt-4 w-full rounded-xl border border-brand-yellow bg-brand-yellow py-3 text-sm font-bold text-black transition active:scale-[0.98]"
                        >
                            Book a Ride
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

export default RideTab