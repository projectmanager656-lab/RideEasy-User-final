import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '../i18n'

/**
 * In-app notification sheet.
 *
 * Purely presentational: Home owns the list, unread count and realtime updates.
 * Tapping an item calls `onSelect`, which recovers the CURRENT ride state before
 * navigating (a notification's stored status may be stale by then).
 */
const NotificationSheet = ({ open, onClose, notifications = [], loading = false, onSelect }) => {
    const { t } = useLanguage()
    const [closing, setClosing] = useState(false)
    const sheetRef = useRef(null)

    useEffect(() => {
        if (!open) {
            setClosing(false)
        }
    }, [open])

    useEffect(() => {
        if (!open) return
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                handleClose()
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [open, closing])

    if (!open && !closing) return null

    const handleClose = () => {
        if (closing) return
        setClosing(true)
    }

    const onAnimationEnd = (e) => {
        if (e.target !== sheetRef.current) return
        if (closing) {
            setClosing(false)
            onClose()
        }
    }

    const portalTarget = typeof document !== 'undefined'
        ? (document.getElementById('root')?.firstElementChild || document.getElementById('root') || document.body)
        : null

    if (!portalTarget) return null

    const content = (
        <div className="absolute inset-0 z-[100] flex flex-col justify-end pointer-events-auto">
            {/* Full-screen backdrop covering the RideEasy application container */}
            <div
                className={`absolute inset-0 bg-black/60 backdrop-blur-[1px] ${
                    closing ? 'sheet-backdrop-out pointer-events-none' : 'sheet-backdrop-in'
                }`}
                onClick={handleClose}
                aria-hidden
            />

            {/* Notification sheet panel */}
            <div
                ref={sheetRef}
                className={`relative z-10 mx-auto flex w-full max-w-[430px] flex-col rounded-t-2xl border-t border-theme bg-theme-card p-4 shadow-2xl ${
                    closing ? 'sheet-slide-down' : 'sheet-slide-up'
                }`}
                style={{ paddingBottom: 'max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))' }}
                onAnimationEnd={onAnimationEnd}
                role="dialog"
                aria-modal="true"
                aria-labelledby="notifications-title"
            >
                {/* Drag handle */}
                <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-theme-muted/50" />

                {/* Header */}
                <div className="mb-4 flex items-center justify-between">
                    <h2 id="notifications-title" className="text-base font-bold text-theme-primary">
                        {t('notifications')}
                    </h2>
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label={t('close')}
                        className="rounded-full border border-theme bg-theme-card px-2.5 py-1 text-xs text-theme-secondary transition active:scale-95 hover:text-theme-primary hover:bg-theme-card-muted"
                    >
                        {t('close')}
                    </button>
                </div>

                {loading && notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-theme bg-theme-card/60 px-4 py-8 text-center">
                        <span className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-brand-yellow border-t-transparent" aria-hidden />
                        <p className="text-sm font-medium text-theme-secondary">{t('loading')}</p>
                    </div>
                ) : notifications.length === 0 ? (
                    /* Empty notification card */
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-theme bg-theme-card/60 px-4 py-8 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
                            <i className="ri-notification-3-line text-2xl" aria-hidden />
                        </div>
                        <p className="text-sm font-medium text-theme-secondary">
                            {t('no_new_notifications')}
                        </p>
                    </div>
                ) : (
                    <ul className="flex max-h-[52dvh] flex-col gap-2 overflow-y-auto">
                        {notifications.map((n) => (
                            <li key={String(n._id)}>
                                <button
                                    type="button"
                                    onClick={() => onSelect?.(n)}
                                    className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition active:scale-[0.99] ${
                                        n.isRead
                                            ? 'border-theme bg-theme-card/60'
                                            : 'border-brand-yellow/50 bg-brand-yellow/10'
                                    }`}
                                >
                                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
                                        <i
                                            className={`${n.meta?.source === 'scheduled_dispatch' ? 'ri-search-line' : 'ri-calendar-check-line'} text-base`}
                                            aria-hidden
                                        />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-1.5">
                                            <span className="truncate text-sm font-semibold text-theme-primary">
                                                {notificationTitle(n, t)}
                                            </span>
                                            {!n.isRead && (
                                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-yellow" aria-hidden />
                                            )}
                                        </span>
                                        <span className="mt-0.5 block text-xs leading-relaxed text-theme-secondary">
                                            {notificationBody(n, t)}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {/* Done button */}
                <button
                    type="button"
                    onClick={handleClose}
                    className="mt-4 w-full rounded-xl border border-theme bg-theme-card py-3 text-sm font-semibold text-theme-primary transition active:scale-[0.98] hover:bg-theme-card-muted"
                >
                    {t('done')}
                </button>
            </div>
        </div>
    )

    return createPortal(content, portalTarget)
}

/**
 * Localized title. Known ride sources get translated copy; anything else renders
 * the stored title verbatim so no notification is ever hidden.
 */
function notificationTitle (n, t) {
    const source = n.meta?.source
    if (source === 'scheduled_booking') return t('notif_ride_scheduled_title')
    if (source === 'scheduled_dispatch') return t('notif_searching_title')
    return n.title || ''
}

/**
 * Localized body. The backend cannot know the device timezone, so the scheduled
 * pickup time is formatted here from the authoritative ISO instant.
 */
function notificationBody (n, t) {
    const source = n.meta?.source
    if (source === 'scheduled_booking') {
        const iso = n.meta?.scheduledPickupAt
        const at = iso ? new Date(iso) : null
        if (at && !Number.isNaN(at.getTime())) {
            const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
            return t('notif_ride_scheduled_body', { time })
        }
        return t('notif_ride_scheduled_body_generic')
    }
    if (source === 'scheduled_dispatch') return t('notif_searching_body')
    return n.message || ''
}

export default NotificationSheet
