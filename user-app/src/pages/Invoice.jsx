import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { apiClient, withAuth } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { stripApiEnvelope } from '../utils/apiBody'
import { useLanguage } from '../i18n'

function formatINR (n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '—'
  return `₹${Math.round(x).toLocaleString('en-IN')}`
}

function formatDate (d, withTime) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString('en-IN', withTime
      ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

function formatDuration (sec) {
  const s = Number(sec)
  if (!Number.isFinite(s) || s < 0) return '—'
  const m = Math.floor(s / 60)
  const r = s % 60
  return m ? `${m} min${r ? ` ${r}s` : ''}` : `${s}s`
}

function paymentLabel (m, t) {
  const u = String(m || '').toUpperCase()
  if (u === 'UPI' || u === 'ONLINE') return t('upi_online')
  if (u === 'WALLET') return t('wallet')
  if (u === 'QR') return t('qr')
  return t('cash')
}

function vehicleTypeLabel (t, v) {
  const u = String(v || '').toUpperCase()
  if (u === 'BIKE') return t('bike')
  if (u === 'AUTO') return t('auto')
  if (u === 'CAR') return t('car')
  if (u === 'PREMIUM' || u === 'LUXURY' || u === 'PREMIUM_CAR') return t('premium_car')
  return String(v || '—')
}

/**
 * RideEasy ride invoice — a clean, document-style Booking History receipt.
 * Data comes only from the backend invoice endpoint for the exact ride.
 */
const Invoice = () => {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [ invoice, setInvoice ] = useState(null)
  const [ loading, setLoading ] = useState(true)
  const [ error, setError ] = useState('')

  useEffect(() => {
    if (!id) {
      setError(t('missing_ride_id'))
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    apiClient
      .get(`/rides/${id}/invoice`, withAuth())
      .then((res) => {
        if (cancelled) return
        const o = stripApiEnvelope(res.data)
        setInvoice(o?.invoice || null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(formatApiError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [ id, t ])

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  const goBack = useCallback(() => {
    if (location.state?.from === 'history') navigate('/history', { replace: true })
    else if (location.state?.from === 'completion') navigate('/riding', { replace: true })
    else navigate(-1)
  }, [ location.state?.from, navigate ])

  const discount = useMemo(() => Number(invoice?.discountAmount) > 0 ? Number(invoice.discountAmount) : 0, [ invoice ])
  const advancePaid = useMemo(() => invoice?.advancePaymentStatus === 'success' ? Number(invoice?.advanceAmount || 0) : 0, [ invoice ])
  const total = useMemo(() => {
    const t = Number(invoice?.totalPaid) > 0 ? Number(invoice.totalPaid) : Number(invoice?.chargedAmount ?? invoice?.fare)
    return Number.isFinite(t) ? t : null
  }, [ invoice ])
  const remainingPaid = useMemo(() => (total != null ? Math.max(0, total - advancePaid) : null), [ total, advancePaid ])

  return (
    <div className="min-h-dvh w-full bg-theme-card text-theme-primary print:text-slate-900 print:bg-white">
      {/* App chrome (hidden when printing) */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-theme bg-theme-bg/90 px-3 py-3 text-theme-primary print:hidden">
        <button
          type="button"
          onClick={goBack}
          aria-label={t('back')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-theme-card text-theme-secondary"
        >
          <i className="ri-arrow-left-line text-lg" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{t('invoice')}</h1>
          <p className="text-xs text-theme-muted">{t('invoice_sub')}</p>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="flex h-10 items-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white"
        >
          <i className="ri-printer-line" aria-hidden />
          {t('download_pdf')}
        </button>
      </header>

      <div className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-8">
        {loading && <p className="py-10 text-center text-sm text-theme-muted">{t('loading')}</p>}

        {!loading && error && (
          <div role="alert" className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        {!loading && !error && !invoice && (
          <div className="rounded border border-theme px-4 py-6 text-center text-sm text-theme-muted">
            {t('invoice_unavailable')}
          </div>
        )}

        {!loading && !error && invoice && (
          <div>
            {/* Document header — RideEasy branding + INVOICE number */}
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-theme pb-4">
              <div>
                <p className="text-2xl font-black tracking-tight text-theme-primary print:text-slate-900">RideEasy</p>
                <p className="text-xs text-theme-muted print:text-slate-500">{t('brand_tagline')}</p>
              </div>
              <div className="text-right">
                <p className="text-base font-bold uppercase tracking-wide text-theme-primary print:text-slate-900">{t('invoice')}</p>
                <p className="text-xs text-theme-muted print:text-slate-500">{invoice.invoiceNumber}</p>
              </div>
            </div>

            {/* Booking history — compact two-column rows */}
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted print:text-slate-500">{t('booking_history')}</p>
              <dl className="mt-2 divide-y divide-theme text-sm">
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-theme-muted print:text-slate-500">{t('passenger')}</dt>
                  <dd className="truncate text-right font-medium text-theme-primary print:text-slate-900">{invoice.passenger?.name || '—'}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-theme-muted print:text-slate-500">{t('ride_id')}</dt>
                  <dd className="truncate text-right font-medium break-all text-theme-primary print:text-slate-900">{invoice.rideId}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-theme-muted print:text-slate-500">{t('driver')}</dt>
                  <dd className="truncate text-right font-medium text-theme-primary print:text-slate-900">{invoice.driver?.name || '—'}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-theme-muted print:text-slate-500">{t('vehicle_number')}</dt>
                  <dd className="truncate text-right font-medium text-theme-primary print:text-slate-900">{invoice.vehicle?.number || '—'}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-theme-muted print:text-slate-500">{t('vehicle_type')}</dt>
                  <dd className="truncate text-right font-medium text-theme-primary print:text-slate-900">{vehicleTypeLabel(t, invoice.vehicle?.type)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-theme-muted print:text-slate-500">{t('ride_time')}</dt>
                  <dd className="truncate text-right font-medium text-theme-primary print:text-slate-900">{formatDate(invoice.invoiceDate, true)}</dd>
                </div>
              </dl>
            </div>

            {/* Selected price — prominent */}
            <div className="mt-6 border-t border-theme pt-5 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted print:text-slate-500">{t('selected_price')}</p>
              <p className="mt-1 text-4xl font-black tracking-tight text-theme-primary print:text-slate-900">{formatINR(total)}</p>
              <p className="mt-2 text-xs text-theme-muted print:text-slate-500">
                {paymentLabel(invoice.paymentMethod, t)}
                <span aria-hidden> · </span>
                {invoice.paymentStatus === 'success' ? t('paid') : t('pending')}
              </p>
            </div>

            {/* Payment breakdown — 25% advance + 75% remaining = 100% of fare */}
            <div className="mt-6 border-t border-theme pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted print:text-slate-500">{t('payment_breakdown')}</p>
              <dl className="mt-3 divide-y divide-theme text-sm">
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-theme-muted print:text-slate-500">{t('total_ride_fare')}</dt>
                  <dd className="text-right font-semibold text-theme-primary print:text-slate-900">{formatINR(invoice.fare)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-theme-muted print:text-slate-500">{t('advance_paid_25')}</dt>
                  <dd className="text-right font-medium text-emerald-700">
                    {formatINR(advancePaid)}
                    {invoice.advancePaymentStatus === 'success' ? (
                      <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{t('paid')}</span>
                    ) : (
                      <span className="ml-1.5 rounded-full bg-theme-card-muted px-2 py-0.5 text-[10px] font-semibold text-theme-muted print:text-slate-500">{t('pending')}</span>
                    )}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-theme-muted print:text-slate-500">{t('remaining_paid_75')}</dt>
                  <dd className="text-right font-medium text-theme-primary print:text-slate-900">
                    {formatINR(remainingPaid)}
                    {invoice.paymentStatus === 'success' ? (
                      <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{t('paid')}</span>
                    ) : (
                      <span className="ml-1.5 rounded-full bg-theme-card-muted px-2 py-0.5 text-[10px] font-semibold text-theme-muted print:text-slate-500">{t('pending')}</span>
                    )}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-theme-primary print:text-slate-900 font-semibold">{t('total_paid')}</dt>
                  <dd className="text-right font-bold text-theme-primary print:text-slate-900">{formatINR(total)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-theme-muted print:text-slate-500">{t('payment_status')}</dt>
                  <dd className="text-right font-medium text-theme-primary print:text-slate-900">
                    {invoice.paymentStatus === 'success' ? t('paid') : t('pending')}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-theme-muted print:text-slate-500">{t('payment_method')}</dt>
                  <dd className="text-right font-medium text-theme-primary print:text-slate-900">{paymentLabel(invoice.paymentMethod, t)}</dd>
                </div>
              </dl>
            </div>

            {/* Trip — pickup / drop with clear indicators */}
            <div className="mt-6 border-t border-theme pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted print:text-slate-500">{t('trip_details')}</p>
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs text-theme-muted print:text-slate-500">{t('pickup')}</p>
                    <p className="font-medium text-theme-primary print:text-slate-900">{invoice.pickup || '—'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs text-theme-muted print:text-slate-500">{t('drop_off')}</p>
                    <p className="font-medium text-theme-primary print:text-slate-900">{invoice.drop || '—'}</p>
                  </div>
                </div>
                {(invoice.distanceKm != null || invoice.durationSec != null) && (
                  <div className="flex items-baseline justify-between gap-4 border-t border-theme pt-3 text-sm">
                    <span className="text-theme-muted print:text-slate-500">{t('distance')}</span>
                    <span className="font-medium text-theme-primary print:text-slate-900">
                      {invoice.distanceKm != null ? `${Number(invoice.distanceKm).toFixed(1)} km` : '—'}
                    </span>
                  </div>
                )}
                {invoice.durationSec != null && (
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="text-theme-muted print:text-slate-500">{t('duration')}</span>
                    <span className="font-medium text-theme-primary print:text-slate-900">{formatDuration(invoice.durationSec)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Fare extras — only real data the backend provides */}
            {(discount > 0 || invoice.serviceFee != null) && (
              <div className="mt-5 border-t border-theme pt-4 text-sm">
                {discount > 0 && (
                  <div className="flex items-baseline justify-between gap-4 py-1">
                    <span className="text-theme-muted print:text-slate-500">{t('discount')}{invoice.discountReason ? ` (${invoice.discountReason})` : ''}</span>
                    <span className="font-medium text-emerald-700">−{formatINR(discount)}</span>
                  </div>
                )}
                {invoice.serviceFee != null && (
                  <div className="flex items-baseline justify-between gap-4 py-1">
                    <span className="text-theme-muted print:text-slate-500">{t('service_fee')}</span>
                    <span className="font-medium text-theme-primary print:text-slate-900">{formatINR(invoice.serviceFee)}</span>
                  </div>
                )}
                {invoice.fare != null && (
                  <div className="flex items-baseline justify-between gap-4 border-t border-theme pt-2.5">
                    <span className="text-theme-muted print:text-slate-500">{t('ride_fare')}</span>
                    <span className="font-medium text-theme-primary print:text-slate-900">{formatINR(invoice.fare)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="mt-8 border-t border-theme pt-4 text-center">
              <p className="text-xs text-theme-muted print:text-slate-500">
                {t('invoice_footer')}
              </p>
              <p className="mt-1 text-[11px] text-theme-muted print:text-slate-400">
                {t('invoice_footer_id', { number: invoice.invoiceNumber })}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Invoice
