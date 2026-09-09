import React from 'react'
import autoImage from '../assets/image.png'
import { useLanguage } from '../i18n'

const SafetyPromoCard = () => {
    const { t } = useLanguage()
    return (
        <div className="relative mx-4 mb-4 flex h-[120px] shrink-0 items-center gap-3.5 overflow-hidden rounded-[18px] bg-theme-card p-3 transition duration-150 active:scale-[0.98]"
            style={{ border: '1px solid rgba(255, 200, 0, 0.55)' }}
        >
            {/* Background image layer — auto fills the right side of the card and blends into the card */}
            <span
                aria-hidden
                className="absolute inset-y-0 right-0 w-[42%] max-w-[170px] overflow-hidden"
            >
                <img
                    src={autoImage}
                    alt=""
                    className="h-full w-full object-cover"
                    style={{
                        objectPosition: 'right 84%',
                        maskImage: 'linear-gradient(to left, black 70%, transparent 100%)',
                        WebkitMaskImage: 'linear-gradient(to left, black 70%, transparent 100%)',
                    }}
                />
            </span>

            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
                <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                    <path d="M9 12l2 2 4-4" />
                </svg>
            </span>

            <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold leading-snug text-theme-primary">
                    {t('safe_rides_verified_drivers')}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-theme-muted">
                    {t('rideeasy_serves_region')}
                </span>
            </span>
        </div>
    )
}

export default SafetyPromoCard
