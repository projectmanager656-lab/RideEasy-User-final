import React from 'react'

function splitLabel (name) {
    const n = String(name || '')
    const comma = n.indexOf(',')
    if (comma > 0) {
        return {
            primary: n.slice(0, comma).trim(),
            secondary: n.slice(comma + 1).trim(),
        }
    }
    return { primary: n, secondary: '' }
}

/**
 * status: 'idle' | 'loading' | 'done' | 'empty' | 'error'
 */
const LocationSearchPanel = ({
    suggestions,
    setPickup,
    setDestination,
    activeField,
    onSelectPickup,
    onSelectDestination,
    status = 'idle',
    errorMessage = '',
}) => {

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
        <div className="max-h-64 overflow-y-auto rounded-[14px] border border-brand-border bg-brand-card">
            {status === 'loading' && (
                <div className="flex items-center gap-2 px-3 py-3 text-xs text-brand-yellow">
                    <span className="h-2.5 w-2.5 animate-spin rounded-full border border-brand-yellow border-t-transparent" />
                    Searching locations...
                </div>
            )}

            {status === 'error' && (
                <div className="px-3 py-3 text-xs text-red-400">
                    {errorMessage || 'Unable to search locations. Please try again.'}
                </div>
            )}

            {status === 'empty' && (
                <div className="px-3 py-3 text-xs text-zinc-500">
                    No matching locations found. Try another search.
                </div>
            )}

            {status === 'done' && suggestions.map((elem, idx) => {
                const name = typeof elem === 'string' ? elem : (elem?.name || elem?.description || '')
                const { primary, secondary } = splitLabel(name)
                return (
                    <button
                        key={idx}
                        type="button"
                        onClick={() => handleSuggestionClick(elem)}
                        className="flex w-full min-h-[44px] items-center gap-3 border-b border-brand-border px-3 py-2 text-left transition hover:bg-[#1B1D1F] active:bg-[#1B1D1F] last:border-b-0"
                    >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
                            <i className="ri-map-pin-2-fill text-base" />
                        </span>
                        <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-white">
                                {primary}
                            </span>
                            {secondary && (
                                <span className="block truncate text-xs text-zinc-500">
                                    {secondary}
                                </span>
                            )}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}

export default LocationSearchPanel