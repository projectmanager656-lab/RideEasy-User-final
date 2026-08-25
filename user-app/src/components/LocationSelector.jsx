import React from 'react'

const LocationSelector = ({
    pickup,
    destination,
    onPickupChange,
    onPickupFocus,
    onDestinationChange,
    onDestinationFocus,
    bookingError,
    notice,
    searching,
}) => {
    return (
        <>
            <div className="mx-4 shrink-0 rounded-[20px] border border-brand-border bg-brand-card p-4 shadow-lg shadow-black/40">
                <div className="mb-2.5 flex items-center justify-between px-1">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        Book a ride
                    </p>
                </div>

                <div className="flex gap-3">
                    <div className="flex shrink-0 flex-col items-center pt-2 pb-1.5">
                        <span
                            className="h-3 w-3 shrink-0 rounded-full bg-brand-pickup ring-4 ring-brand-pickup/20"
                            aria-hidden
                        />
                        <span className="my-1 w-px flex-1 border-l-2 border-dotted border-zinc-400" aria-hidden />
                        <span
                            className="h-3 w-3 shrink-0 rounded-full bg-brand-drop ring-4 ring-brand-drop/20"
                            aria-hidden
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="py-2">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-[#A0A0A0]">
                                Pickup location
                            </p>
                            <input
                                className="w-full bg-transparent py-1 text-sm font-medium text-white placeholder-[#707070] outline-none focus:text-white"
                                type="text"
                                value={pickup}
                                onChange={onPickupChange}
                                onFocus={onPickupFocus}
                                placeholder="Enter pickup location"
                                autoComplete="off"
                            />
                        </div>
                        <div className="py-2">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-[#A0A0A0]">
                                Drop location
                            </p>
                            <input
                                className="w-full bg-transparent py-1 text-sm font-medium text-white placeholder-[#707070] outline-none focus:text-white"
                                type="text"
                                value={destination}
                                onChange={onDestinationChange}
                                onFocus={onDestinationFocus}
                                placeholder="Enter drop location"
                                autoComplete="off"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="mx-4 pt-2">
                {searching && (
                    <p className="flex items-center gap-1.5 text-[11px] text-brand-yellow">
                        <span className="h-2 w-2 animate-spin rounded-full border border-brand-yellow border-t-transparent" />
                        Searching locations...
                    </p>
                )}

                {notice && (
                    <p className="text-[11px] text-brand-yellow">{notice}</p>
                )}

                {bookingError && (
                    <p className="text-[11px] text-red-400">{bookingError}</p>
                )}
            </div>
        </>
    )
}

export default LocationSelector