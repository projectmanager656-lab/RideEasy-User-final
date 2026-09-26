import React from 'react'
import { useLanguage } from '../i18n'

const OUTSTATION_ROUTES = [
    { city: 'Pune', note: '230 km' },
    { city: 'Mumbai', note: '400 km' },
    { city: 'Bengaluru', note: '620 km' },
]

const OutstationModal = ({ open, onClose, onBook }) => {
    const { t } = useLanguage()
    if (!open) return null

    return (
        <div className="absolute inset-0 z-40 flex flex-col justify-end">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
                onClick={onClose}
                aria-hidden
            />
            <div className="relative max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-theme bg-theme-card p-4">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-theme-muted" />
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-base font-bold text-theme-primary">{t('outstation')}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full border border-theme bg-theme-card-muted px-2.5 py-1 text-xs text-theme-secondary active:scale-95"
                    >
                        {t('close')}
                    </button>
                </div>

                <p className="mb-3 text-xs text-theme-secondary">
                    {t('outstation_sub')}
                </p>

                <div className="space-y-2">
                    {OUTSTATION_ROUTES.map((r) => (
                        <button
                            key={r.city}
                            type="button"
                            onClick={() => onBook(r.city)}
                            className="flex w-full items-center justify-between rounded-xl border border-theme bg-theme-card-muted px-3.5 py-3 text-left transition active:scale-[0.98]"
                        >
                            <span className="text-sm font-semibold text-theme-primary">{r.city}</span>
                            <span className="text-xs text-theme-muted">{r.note} · {t('coming_soon')}</span>
                        </button>
                    ))}
                </div>

                <p className="mt-3 text-[11px] text-theme-muted">
                    {t('outstation_footer')}
                </p>
            </div>
        </div>
    )
}

export default OutstationModal
