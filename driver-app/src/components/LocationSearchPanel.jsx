import React from 'react'

const LocationSearchPanel = ({ suggestions, setPickup, setDestination, activeField, onSelectPickup, onSelectDestination }) => {

    const handleSuggestionClick = (suggestion) => {
        const name = typeof suggestion === 'string' ? suggestion : (suggestion?.name || suggestion?.description || '')
        if (activeField === 'pickup') {
            setPickup(name)
            onSelectPickup?.(suggestion)
        } else if (activeField === 'destination') {
            setDestination(name)
            onSelectDestination?.(suggestion)
        }
    }

    return (
        <div className="max-h-72 overflow-y-auto bg-white">
            {suggestions.map((elem, idx) => {
                const display = typeof elem === 'string' ? elem : (elem?.name || elem?.description || '')
                return (
                    <button
                        key={idx}
                        type="button"
                        onClick={() => handleSuggestionClick(elem)}
                        className="w-full text-left flex gap-4 border-b border-slate-100 px-3 py-2 hover:bg-slate-50 active:bg-slate-100 cursor-pointer"
                    >
                        <div className="bg-emerald-50 text-emerald-600 h-8 flex items-center justify-center w-8 rounded-full">
                            <i className="ri-map-pin-fill" />
                        </div>
                        <h4 className="font-medium text-sm text-slate-900 truncate">
                            {display}
                        </h4>
                    </button>
                )
            })}
            {!suggestions.length && (
                <div className="px-3 py-2 text-xs text-slate-400">
                    Type a location in Pune / Kolhapur to see suggestions.
                </div>
            )}
        </div>
    )
}

export default LocationSearchPanel