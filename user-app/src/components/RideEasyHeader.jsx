import React from 'react'
import { useLanguage } from '../i18n'

const RideEasyHeader = ({ onNotifications, onSchedule, onBack }) => {
    const { t } = useLanguage()
    return (
        <header className="flex shrink-0 items-center justify-between px-4 pt-4 pb-3">
            <div className="flex min-w-0 items-center gap-3">
                {onBack && (
                    <button
                        type="button"
                        aria-label={t('back')}
                        onClick={onBack}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-theme bg-theme-card text-brand-yellow transition active:scale-95"
                    >
                        <i className="ri-arrow-left-line text-lg" aria-hidden />
                    </button>
                )}
                <div className="leading-tight">
                <h1 className="text-2xl font-extrabold tracking-tight">
                    <span className="text-theme-primary">Ride</span><span className="text-brand-yellow">Easy</span>
                </h1>
                <p className="text-[13px] text-theme-muted">{t('ride_anywhere_any_time')}</p>
                </div>
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