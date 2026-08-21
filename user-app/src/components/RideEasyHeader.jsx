import React from 'react'

const RideEasyHeader = ({ onNotifications }) => {
    return (
        <header className="flex shrink-0 items-center justify-between px-4 pt-4 pb-3">
            <div className="leading-tight">
                <h1 className="text-2xl font-extrabold tracking-tight text-white">
                    Ride<span className="text-brand-yellow">Easy</span>
                </h1>
                <p className="text-[13px] text-[#8A8A8A]">Ride Anywhere, Anywhere</p>
            </div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    aria-label="Notifications"
                    onClick={onNotifications}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-border bg-brand-card text-brand-yellow transition active:scale-95"
                >
                    <i className="ri-notification-3-line text-base" />
                </button>
            </div>
        </header>
    )
}

export default RideEasyHeader