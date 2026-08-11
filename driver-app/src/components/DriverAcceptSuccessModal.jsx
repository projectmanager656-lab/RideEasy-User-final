import React from 'react'

export default function DriverAcceptSuccessModal ({ open, onContinue }) {
    if (!open) return null

    return (
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="driver-accept-success-title"
        >
            <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 text-center shadow-xl">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                    <i className="ri-checkbox-circle-fill text-3xl" aria-hidden />
                </div>
                <h2 id="driver-accept-success-title" className="text-lg font-bold text-white">
                    Ride स्वीकारला
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                    आता pickup वर जा. Passenger कडून 6 अंकी OTP घ्या आणि खालच्या स्क्रीनवर टाका.
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                    Ride accepted. Go to pickup, get the OTP, then use the next screen.
                </p>
                <button
                    type="button"
                    className="mt-5 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
                    onClick={onContinue}
                >
                    पुढे जा · Continue
                </button>
            </div>
        </div>
    )
}
