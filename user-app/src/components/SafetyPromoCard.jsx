import React from 'react'
import autoImage from '../assets/image.png'

const SafetyPromoCard = () => {
    return (
        <div className="mx-4 mb-4 flex h-[104px] shrink-0 items-center gap-3.5 rounded-[18px] bg-[#111315] p-3 transition duration-150 active:scale-[0.98]"
            style={{ border: '1px solid rgba(255, 200, 0, 0.55)' }}
        >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
                <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                    <path d="M9 12l2 2 4-4" />
                </svg>
            </span>

            <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold leading-snug text-white">
                    Safe rides. Verified drivers.
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-[#9A9A9A]">
                    RideEasy serves Kolhapur regions.
                </span>
            </span>

            <span className="flex h-full w-[34%] min-w-[100px] max-w-[140px] shrink-0 items-center overflow-hidden">
                <img
                    src={autoImage}
                    alt="RideEasy auto-rickshaw"
                    className="h-full w-full object-contain"
                />
            </span>
        </div>
    )
}

export default SafetyPromoCard