import React from 'react'

export default function OverviewTab ({ analytics, analyticsLoading, analyticsError }) {
  if (analyticsLoading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-12 text-center text-neutral-600">
        Loading overview…
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
        No overview data yet. Use &quot;Refresh stats&quot; or check the API connection.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Total users', value: analytics.totalUsers, sub: 'Customers' },
          { label: 'Total drivers', value: analytics.totalDrivers, sub: 'Registered' },
          { label: 'Online drivers', value: analytics.activeDriversOnline ?? 0, sub: 'Active + subscribed' },
          { label: 'Total rides', value: analytics.totalRides, sub: 'All statuses' },
          { label: 'Gross fare (₹)', value: analytics.totalRevenue ?? 0, sub: 'Completed rides' },
          { label: 'Platform revenue (₹)', value: analytics.platformIncomeTotal ?? 0, sub: 'Commission', accent: true },
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
          Completed rides: <span className="font-semibold text-black">{analytics.completedRideCount ?? '—'}</span>
          {' · '}With captain assigned:{' '}
          <span className="font-semibold text-black">{analytics.completedWithCaptainCount ?? '—'}</span>
        </div>
      )}

      {analytics.cityAnalytics && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-black">By city</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {[ 'Kolhapur', 'Ichalkaranji', 'Sangli' ].map((city) => (
              <div key={city} className="rounded-2xl border border-neutral-200 bg-white p-4">
                <p className="font-medium text-black">{city}</p>
                <p className="mt-2 text-sm text-neutral-600">
                  Rides: <span className="text-black">{analytics.cityAnalytics[city]?.rides ?? 0}</span>
                  {' · '}Drivers: <span className="text-black">{analytics.cityAnalytics[city]?.drivers ?? 0}</span>
                  {' · '}Fare total: ₹<span className="tabular-nums text-black">{analytics.cityAnalytics[city]?.revenue ?? 0}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
