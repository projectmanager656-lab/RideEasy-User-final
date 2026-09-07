import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { apiClient, withAuth } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { stripApiEnvelope } from '../utils/apiBody'

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

function paymentLabel (m) {
  const u = String(m || '').toUpperCase()
  if (u === 'UPI' || u === 'ONLINE') return 'UPI / Online'
  if (u === 'WALLET') return 'Wallet'
  if (u === 'QR') return 'QR'
  return 'Cash'
}

function vehicleTypeLabel (t) {
  const u = String(t || '').toUpperCase()
  if (u === 'BIKE') return 'Bike'
  if (u === 'AUTO') return 'Auto'
  if (u === 'CAR') return 'Car'
  if (u === 'PREMIUM' || u === 'LUXURY' || u === 'PREMIUM_CAR') return 'Premium Car'
  return String(t || '—')
}

/**
 * RideEasy ride invoice — a clean, document-style Booking History receipt.
 * Data comes only from the backend invoice endpoint for the exact ride.
 */
const Invoice = () => {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [ invoice, setInvoice ] = useState(null)
  const [ loading, setLoading ] = useState(true)
  const [ error, setError ] = useState('')

  useEffect(() => {
    if (!id) {
      setError('Missing ride id')
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
  }, [ id ])

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
    <div className="min-h-dvh w-full bg-white text-slate-900 print:bg-white">
      {/* App chrome (hidden when printing) */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-800 bg-zinc-950 px-3 py-3 text-white print:hidden">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-200"
        >
          <i className="ri-arrow-left-line text-lg" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">Invoice</h1>
          <p className="text-xs text-zinc-500">Trip receipt for your completed ride</p>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="flex h-10 items-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white"
        >
          <i className="ri-printer-line" aria-hidden />
          Download PDF
        </button>
      </header>

      <div className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-8">
        {loading && <p className="py-10 text-center text-sm text-slate-500">Loading invoice…</p>}

        {!loading && error && (
          <div role="alert" className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && !invoice && (
          <div className="rounded border border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
            Invoice data is not available for this ride.
          </div>
        )}

        {!loading && !error && invoice && (
          <div>
            {/* Document header — RideEasy branding + INVOICE number */}
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-300 pb-4">
              <div>
                <p className="text-2xl font-black tracking-tight text-slate-900">RideEasy</p>
                <p className="text-xs text-slate-500">Safe · Reliable · Local rides</p>
              </div>
              <div className="text-right">
                <p className="text-base font-bold uppercase tracking-wide text-slate-900">Invoice</p>
                <p className="text-xs text-slate-500">{invoice.invoiceNumber}</p>
              </div>
            </div>

            {/* Booking history — compact two-column rows */}
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Booking History</p>
              <dl className="mt-2 divide-y divide-slate-200 text-sm">
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-slate-500">Passenger</dt>
                  <dd className="truncate text-right font-medium text-slate-900">{invoice.passenger?.name || '—'}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-slate-500">Ride ID</dt>
                  <dd className="truncate text-right font-medium break-all text-slate-900">{invoice.rideId}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-slate-500">Driver</dt>
                  <dd className="truncate text-right font-medium text-slate-900">{invoice.driver?.name || '—'}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-slate-500">Vehicle Number</dt>
                  <dd className="truncate text-right font-medium text-slate-900">{invoice.vehicle?.number || '—'}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-slate-500">Vehicle Type</dt>
                  <dd className="truncate text-right font-medium text-slate-900">{vehicleTypeLabel(invoice.vehicle?.type)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-slate-500">Ride Time</dt>
                  <dd className="truncate text-right font-medium text-slate-900">{formatDate(invoice.invoiceDate, true)}</dd>
                </div>
              </dl>
            </div>

            {/* Selected price — prominent */}
            <div className="mt-6 border-t border-slate-300 pt-5 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Selected Price</p>
              <p className="mt-1 text-4xl font-black tracking-tight text-slate-900">{formatINR(total)}</p>
              <p className="mt-2 text-xs text-slate-500">
                {paymentLabel(invoice.paymentMethod)}
                <span aria-hidden> · </span>
                {invoice.paymentStatus === 'success' ? 'Paid' : 'Pending'}
              </p>
            </div>

            {/* Payment breakdown — 25% advance + 75% remaining = 100% of fare */}
            <div className="mt-6 border-t border-slate-300 pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Payment Breakdown</p>
              <dl className="mt-3 divide-y divide-slate-200 text-sm">
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-slate-500">Total Ride Fare</dt>
                  <dd className="text-right font-semibold text-slate-900">{formatINR(invoice.fare)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-slate-500">25% Advance Paid</dt>
                  <dd className="text-right font-medium text-emerald-700">
                    {formatINR(advancePaid)}
                    {invoice.advancePaymentStatus === 'success' ? (
                      <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Paid</span>
                    ) : (
                      <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Pending</span>
                    )}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-slate-500">Remaining 75% Paid</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {formatINR(remainingPaid)}
                    {invoice.paymentStatus === 'success' ? (
                      <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Paid</span>
                    ) : (
                      <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Pending</span>
                    )}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-slate-900 font-semibold">Total Paid</dt>
                  <dd className="text-right font-bold text-slate-900">{formatINR(total)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-slate-500">Payment Status</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {invoice.paymentStatus === 'success' ? 'Paid' : 'Pending'}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-slate-500">Payment Method</dt>
                  <dd className="text-right font-medium text-slate-900">{paymentLabel(invoice.paymentMethod)}</dd>
                </div>
              </dl>
            </div>

            {/* Trip — pickup / drop with clear indicators */}
            <div className="mt-6 border-t border-slate-300 pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Trip Details</p>
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">Pickup</p>
                    <p className="font-medium text-slate-900">{invoice.pickup || '—'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">Drop-off</p>
                    <p className="font-medium text-slate-900">{invoice.drop || '—'}</p>
                  </div>
                </div>
                {(invoice.distanceKm != null || invoice.durationSec != null) && (
                  <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-3 text-sm">
                    <span className="text-slate-500">Distance</span>
                    <span className="font-medium text-slate-900">
                      {invoice.distanceKm != null ? `${Number(invoice.distanceKm).toFixed(1)} km` : '—'}
                    </span>
                  </div>
                )}
                {invoice.durationSec != null && (
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="text-slate-500">Duration</span>
                    <span className="font-medium text-slate-900">{formatDuration(invoice.durationSec)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Fare extras — only real data the backend provides */}
            {(discount > 0 || invoice.serviceFee != null) && (
              <div className="mt-5 border-t border-slate-200 pt-4 text-sm">
                {discount > 0 && (
                  <div className="flex items-baseline justify-between gap-4 py-1">
                    <span className="text-slate-500">Discount{invoice.discountReason ? ` (${invoice.discountReason})` : ''}</span>
                    <span className="font-medium text-emerald-700">−{formatINR(discount)}</span>
                  </div>
                )}
                {invoice.serviceFee != null && (
                  <div className="flex items-baseline justify-between gap-4 py-1">
                    <span className="text-slate-500">Service fee</span>
                    <span className="font-medium text-slate-900">{formatINR(invoice.serviceFee)}</span>
                  </div>
                )}
                {invoice.fare != null && (
                  <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-2.5">
                    <span className="text-slate-500">Ride fare</span>
                    <span className="font-medium text-slate-900">{formatINR(invoice.fare)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="mt-8 border-t border-slate-300 pt-4 text-center">
              <p className="text-xs text-slate-500">
                This invoice was generated for your completed ride with RideEasy.
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Invoice {invoice.invoiceNumber} · RideEasy
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Invoice
