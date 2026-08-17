import React from 'react'
import { useLanguage } from '../../i18n'

export default function OverviewTab ({ analytics, analyticsLoading, analyticsError }) {
  const { t } = useLanguage()

  if (analyticsLoading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-12 text-center text-neutral-600">
        {t('loading_overview')}
      </div>
    )
  }

  if (analyticsError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-900">
        {analyticsError}
      </div>
    )
  }

  if (!analytics) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-8 text-center text-neutral-600 text-sm">
        {t('no_overview_data')}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: t('total_users_label'), value: analytics.totalUsers, sub: t('customers_subtitle') },
          { label: t('total_drivers_label'), value: analytics.totalDrivers, sub: t('registered_subtitle') },
          { label: t('online_drivers_label'), value: analytics.activeDriversOnline ?? 0, sub: t('active_subscribed_subtitle') },
          { label: t('total_rides_label'), value: analytics.totalRides, sub: t('all_statuses_subtitle') },
          { label: t('gross_fare_label'), value: analytics.totalRevenue ?? 0, sub: t('completed_rides_subtitle') },
          { label: t('platform_revenue_label'), value: analytics.platformIncomeTotal ?? 0, sub: t('commission_subtitle'), accent: true },
        ].map((card) => (
          <div
            key={card.label}
            className={`rounded-2xl border p-4 ${
              card.accent
                ? 'border-black bg-neutral-100'
                : 'border-neutral-200 bg-white'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{card.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-black">{card.value}</p>
            <p className="mt-1 text-xs text-neutral-500">{card.sub}</p>
          </div>
        ))}
      </div>

      {(analytics.completedRideCount != null || analytics.completedWithCaptainCount != null) && (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
          {t('completed_rides_prefix')}<span className="font-semibold text-black">{analytics.completedRideCount ?? '—'}</span>
          {t('with_captain_assigned_prefix')}
          <span className="font-semibold text-black">{analytics.completedWithCaptainCount ?? '—'}</span>
        </div>
      )}

      {analytics.cityAnalytics && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-black">{t('by_city')}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {[ 'Kolhapur', 'Ichalkaranji', 'Sangli' ].map((city) => (
              <div key={city} className="rounded-2xl border border-neutral-200 bg-white p-4">
                <p className="font-medium text-black">{city}</p>
                <p className="mt-2 text-sm text-neutral-600">
                  {t('rides_prefix')}<span className="text-black">{analytics.cityAnalytics[city]?.rides ?? 0}</span>
                  {t('drivers_prefix')}<span className="text-black">{analytics.cityAnalytics[city]?.drivers ?? 0}</span>
                  {t('fare_total_prefix')}<span className="tabular-nums text-black">{analytics.cityAnalytics[city]?.revenue ?? 0}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
