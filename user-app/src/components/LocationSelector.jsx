import React from 'react'
import { useLanguage } from '../i18n'

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
 * Suggestions shown in place of "Recent searches" while the user types.
 * Scrolls internally with a fully hidden scrollbar.
 */
const SuggestionsArea = ({ status, suggestions, onSelect }) => {
    const { t } = useLanguage()
    return (
        <div className="max-h-48 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {status === 'loading' && (
                <p className="flex items-center gap-1.5 px-1 py-2 text-xs text-brand-yellow">
                    <span className="h-2 w-2 animate-spin rounded-full border border-brand-yellow border-t-transparent" />
                    {t('searching_locations')}
                </p>
            )}
            {(status === 'empty' || (status === 'done' && suggestions.length === 0)) && (
                <p className="px-1 py-2 text-xs text-theme-muted">{t('no_locations_found')}</p>
            )}
            {status === 'done' && suggestions.length > 0 && (
                <div className="divide-y divide-theme">
                    {suggestions.map((suggestion, idx) => {
                        const name = typeof suggestion === 'string' ? suggestion : (suggestion?.name || '')
                        const { primary, secondary } = splitLabel(name)
                        return (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => onSelect?.(suggestion)}
                                className="flex w-full items-center gap-3 py-2.5 text-left transition active:scale-[0.99]"
                            >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
                                    <i className="ri-map-pin-2-line text-sm" aria-hidden />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-theme-primary">{primary}</span>
                                    {secondary && (
                                        <span className="block truncate text-xs text-theme-secondary">{secondary}</span>
                                    )}
                                </span>
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

const LocationSelector = ({
    pickup,
    destination,
    onPickupChange,
    onPickupFocus,
    onDestinationChange,
    onDestinationFocus,
    bookingError,
    recents = [],
    onSelectRecent,
    searchStatus = 'idle',
    searching = false,
    suggestions = [],
    onSelectSuggestion,
    onForMeOpen,
}) => {
    const { t } = useLanguage()
    const showSuggestions = searching && searchStatus !== 'idle'

    return (
        <div className="mx-4 shrink-0 rounded-[20px] border border-theme bg-theme-card p-4 shadow-lg shadow-black/40">
            {/* Title row + For me switcher */}
            <div className="mb-2.5 flex items-center justify-between px-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-theme-muted">
                    {t('book_a_ride')}
                </p>
                <button
                    type="button"
                    onClick={onForMeOpen}
                    className="flex items-center gap-1.5 rounded-full border border-theme bg-theme-card-muted px-2.5 py-1 text-xs font-medium text-theme-primary transition active:scale-95"
                >
                    <i className="ri-user-3-line text-brand-yellow" aria-hidden />
                    {t('for_me')}
                    <i className="ri-arrow-down-s-line text-theme-secondary" aria-hidden />
                </button>
            </div>

            {/* Pickup / Drop */}
            <div className="flex gap-3">
                <div className="flex shrink-0 flex-col items-center pt-2 pb-1.5">
                    <span
                        className="h-3 w-3 shrink-0 rounded-full bg-brand-pickup ring-4 ring-brand-pickup/20"
                        aria-hidden
                    />
                    <span className="my-1 w-px flex-1 border-l-2 border-dotted border-theme" aria-hidden />
                    <span
                        className="h-3 w-3 shrink-0 rounded-full bg-brand-drop ring-4 ring-brand-drop/20"
                        aria-hidden
                    />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="py-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-theme-muted">
                            {t('pickup_location')}
                        </p>
                        <input
                            className="w-full bg-transparent py-1 text-sm font-medium text-theme-primary placeholder:text-theme-muted outline-none focus:text-theme-primary"
                            type="text"
                            value={pickup}
                            onChange={onPickupChange}
                            onFocus={onPickupFocus}
                            placeholder={t('enter_pickup_location')}
                            autoComplete="off"
                        />
                    </div>
                    <div className="py-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-theme-muted">
                            {t('drop_location')}
                        </p>
                        <input
                            className="w-full bg-transparent py-1 text-sm font-medium text-theme-primary placeholder:text-theme-muted outline-none focus:text-theme-primary"
                            type="text"
                            value={destination}
                            onChange={onDestinationChange}
                            onFocus={onDestinationFocus}
                            placeholder={t('enter_drop_location')}
                            autoComplete="off"
                        />
                        {bookingError && <p className="pt-1 text-[11px] text-red-400">{bookingError}</p>}
                    </div>
                </div>
            </div>

            {/* Recent searches / suggestions — same container, swapped in place */}
            <div className="mt-3 border-t border-theme pt-3">
                {showSuggestions ? (
                    <SuggestionsArea
                        status={searchStatus}
                        suggestions={suggestions}
                        onSelect={onSelectSuggestion}
                    />
                ) : (
                    <>
                        <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-theme-muted">
                            {t('recent_searches')}
                        </p>
                        {recents.length === 0 ? (
                            <p className="px-1 py-2 text-xs text-theme-muted">{t('no_recent_searches')}</p>
                        ) : (
                            <div className="divide-y divide-theme">
                                {recents.slice(0, 4).map((item, idx) => {
                                    const fromAddr = String(item.pickup || '').trim()
                                    const toAddr = String(item.destination || item.name || '').trim()
                                    return (
                                        <button
                                            key={`${fromAddr}-${toAddr}-${idx}`}
                                            type="button"
                                            onClick={() => onSelectRecent?.(item)}
                                            className="flex w-full items-center gap-3 py-2.5 text-left transition active:scale-[0.99]"
                                        >
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
                                                <i className="ri-history-line text-sm" aria-hidden />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                {fromAddr && (
                                                    <span className="block truncate text-xs text-theme-secondary">{fromAddr}</span>
                                                )}
                                                <span className="block truncate text-sm font-medium text-theme-primary">{toAddr}</span>
                                            </span>
                                            <i className="ri-arrow-right-s-line text-theme-muted" aria-hidden />
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

export default LocationSelector
