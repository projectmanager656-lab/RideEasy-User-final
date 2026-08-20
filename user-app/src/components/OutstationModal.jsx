import React from 'react'

const OUTSTATION_ROUTES = [
    { city: 'Pune', note: '230 km' },
    { city: 'Mumbai', note: '400 km' },
    { city: 'Bengaluru', note: '620 km' },
]

const OutstationModal = ({ open, onClose, onBook }) => {
    if (!open) return null

    return (
        <div className="absolute inset-0 z-40 flex flex-col justify-end">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
                onClick={onClose}
                aria-hidden
            />
            <div className="relative max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-brand-border bg-[#101010] p-4">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-700" />
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-base font-bold text-white">Outstation</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full border border-brand-border bg-brand-card px-2.5 py-1 text-xs text-zinc-400 active:scale-95"
                    >
                        Close
                    </button>
                </div>

                <p className="mb-3 text-xs text-zinc-400">
                    One-way and round trips to nearby cities from your service area.
                </p>

                <div className="space-y-2">
                    {OUTSTATION_ROUTES.map((r) => (
                        <button
                            key={r.city}
                            type="button"
                            onClick={() => onBook(r.city)}
                            className="flex w-full items-center justify-between rounded-xl border border-brand-border bg-brand-card px-3.5 py-3 text-left transition active:scale-[0.98]"
                        >
                            <span className="text-sm font-semibold text-white">{r.city}</span>
                            <span className="text-xs text-zinc-500">{r.note} · Coming soon</span>
                        </button>
                    ))}
                </div>

                <p className="mt-3 text-[11px] text-zinc-500">
                    Outstation booking will be connected to the backend soon. Selecting a route
                    returns you to the standard booking screen.
                </p>
            </div>
        </div>
    )
}

export default OutstationModal