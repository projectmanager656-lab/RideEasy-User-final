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
        <div className="max-h-72 overflow-y-auto bg-night-900">
            {suggestions.map((elem, idx) => {
                const display = typeof elem === 'string' ? elem : (elem?.name || elem?.description || '')
                return (
                    <button
                        key={idx}
                        type="button"
                        onClick={() => handleSuggestionClick(elem)}
                        className="w-full text-left flex gap-4 border-b border-night-border px-3 py-2 hover:bg-night-800 active:bg-night-700 cursor-pointer"
                    >
                        <div className="bg-brand/15 text-brand h-8 flex items-center justify-center w-8 rounded-full">
                            <i className="ri-map-pin-fill" />
                        </div>
                        <h4 className="font-medium text-sm text-white truncate">
                            {display}
                        </h4>
                    </button>
                )
            })}
            {!suggestions.length && (
                <div className="px-3 py-2 text-xs text-zinc-500">
                    Type an address — suggestions are biased to Kolhapur, Ichalkaranji, or Sangli (pick city above).
                </div>
            )}
        </div>
    )
}

export default LocationSearchPanel