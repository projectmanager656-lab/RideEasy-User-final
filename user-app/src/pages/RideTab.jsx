import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../i18n'

const USER_RIDE_SESSION_KEY = 'rideeasy_user_ride'

const RideTab = () => {
    const { t } = useLanguage()
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
            <h1 className="text-lg font-bold text-theme-primary">{t('ride')}</h1>
            <p className="text-[11px] text-theme-muted">{t('current_ride')}</p>

            <div className="mt-5 rounded-2xl border border-theme bg-theme-card p-5 text-center">
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
                        <h2 className="text-sm font-semibold text-theme-primary">{t('you_have_active_ride')}</h2>
                        <p className="mt-1 text-xs text-theme-muted">
                            {t('track_captain_live')}
                        </p>
                        <button
                            type="button"
                            onClick={() => navigate('/riding')}
                            className="mt-4 w-full rounded-xl border border-brand-yellow bg-brand-yellow py-3 text-sm font-bold text-black transition active:scale-[0.98]"
                        >
                            {t('open_live_ride')}
                        </button>
                    </>
                ) : (
                    <>
                        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-theme bg-theme-card-muted text-theme-muted">
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
                        <h2 className="text-sm font-semibold text-theme-primary">{t('no_active_ride')}</h2>
                        <p className="mt-1 text-xs text-theme-muted">
                            {t('book_ride_live_tracking')}
                        </p>
                        <button
                            type="button"
                            onClick={() => navigate('/home')}
                            className="mt-4 w-full rounded-xl border border-brand-yellow bg-brand-yellow py-3 text-sm font-bold text-black transition active:scale-[0.98]"
                        >
                            {t('book_a_ride')}
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

export default RideTab