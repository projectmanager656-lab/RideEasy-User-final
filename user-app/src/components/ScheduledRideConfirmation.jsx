import React from 'react'
import { useLanguage } from '../i18n'

/** Human-readable date + time in the passenger's own timezone. */
function formatScheduledAt (iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return {
    date: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  }
}

const Row = ({ icon, label, value }) => (
  <div className="flex items-start gap-3 border-b border-theme py-3 last:border-b-0">
    <i className={`${icon} mt-0.5 text-base text-brand-yellow`} aria-hidden />
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-theme-muted">{label}</p>
      <p className="mt-0.5 break-words text-sm font-medium text-theme-primary">{value || '—'}</p>
    </div>
  </div>
)

/**
 * Shown after a successful SCHEDULED booking — the ride is only reserved, so we
 * deliberately do NOT enter the searching-for-driver flow here. The backend
 * dispatcher starts the driver search later and notifies the passenger.
 */
export default function ScheduledRideConfirmation ({ ride, pickup, destination, vehicleType, onDone, onViewTrips }) {
  const { t } = useLanguage()
  const when = formatScheduledAt(ride?.scheduledPickupAt)

  return (
    <div className="relative flex h-full w-full flex-col overflow-y-auto bg-theme-bg text-theme-primary">
      <div className="mx-auto flex min-h-full w-full max-w-[430px] flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15" aria-hidden>
            <i className="ri-calendar-check-line text-3xl text-emerald-400" />
          </span>
          <h1 className="mt-4 text-xl font-bold text-theme-primary">{t('ride_scheduled')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-theme-secondary">{t('ride_scheduled_hint')}</p>
        </div>

        <div className="mt-6 rounded-2xl border border-theme bg-theme-card px-4 py-1">
          <Row icon="ri-map-pin-user-line" label={t('pickup')} value={pickup} />
          <Row icon="ri-map-pin-2-line" label={t('drop')} value={destination} />
          <Row
            icon="ri-calendar-schedule-line"
            label={t('scheduled_for')}
            value={when ? `${when.date} · ${when.time}` : null}
          />
          <Row icon="ri-roadster-line" label={t('vehicle')} value={vehicleType} />
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-6">
          <button
            type="button"
            onClick={onViewTrips}
            className="w-full rounded-2xl border border-theme bg-theme-card px-4 py-3 text-sm font-bold text-theme-primary transition active:scale-[0.99]"
          >
            {t('view_my_trips')}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="w-full rounded-2xl bg-brand-yellow px-4 py-3.5 text-sm font-bold text-black transition active:scale-[0.99]"
          >
            {t('done')}
          </button>
        </div>
      </div>
    </div>
  )
}
