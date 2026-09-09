import React from 'react'
import { useLanguage } from '../i18n'

const RideEasyHeader = ({ onNotifications, onSchedule }) => {
    const { t } = useLanguage()
    return (
        <header className="flex shrink-0 items-center justify-between px-4 pt-4 pb-3">
            <div className="leading-tight">
                <h1 className="text-2xl font-extrabold tracking-tight text-theme-primary">
                    Ride<span className="text-brand-yellow">Easy</span>
                </h1>
                <p className="text-[13px] text-theme-muted">{t('ride_anywhere_any_time')}</p>
            </div>
            <div className="flex items-center gap-2">
                {onSchedule && (
                    <button
                        type="button"
                        aria-label={t('schedule')}
                        onClick={onSchedule}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-theme bg-theme-card text-brand-yellow transition active:scale-95"
                    >
                        <i className="ri-calendar-line text-base" />
                    </button>
                )}
                <button
                    type="button"
                    aria-label={t('notifications')}
                    onClick={onNotifications}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-theme bg-theme-card text-brand-yellow transition active:scale-95"
                >
                    <i className="ri-notification-3-line text-base" />
                </button>
            </div>
        </header>
    )
}

export default RideEasyHeader