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

/**
 * RideEasy ride invoice — printable (white, professional) layout.
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
  const total = useMemo(() => {
    const t = Number(invoice?.chargedAmount ?? invoice?.fare)
    return Number.isFinite(t) ? t : null
  }, [ invoice ])

  return (
    <div className="min-h-dvh w-full bg-zinc-950 text-white">
      {/* App chrome (hidden when printing) */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-800 bg-zinc-950/95 px-3 py-3 backdrop-blur print:hidden">
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

      <div className="mx-auto w-full max-w-2xl px-3 py-5 sm:px-4">
        {loading && <p className="py-10 text-center text-sm text-zinc-500">Loading invoice…</p>}

        {!loading && error && (
          <div role="alert" className="rounded-xl border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {!loading && !error && !invoice && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-6 text-center text-sm text-zinc-400">
            Invoice data is not available for this ride.
          </div>
        )}

        {!loading && !error && invoice && (
          <div className="rounded-2xl bg-white text-slate-900 shadow-xl print:rounded-none print:shadow-none">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-lg font-black text-white">
                  RE
                </div>
                <div>
                  <p className="text-lg font-bold tracking-tight text-slate-900">RideEasy</p>
                  <p className="text-xs text-slate-500">Safe · Reliable · Local rides</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold uppercase tracking-wide text-slate-900">Invoice</p>
                <p className="mt-0.5 text-xs text-slate-500">{invoice.invoiceNumber}</p>
              </div>
            </div>

            {/* Meta + parties */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 px-6 py-5 sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Invoice date</p>
                <p className="mt-1 text-sm font-medium text-slate-800">{formatDate(invoice.invoiceDate, true)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Ride ID</p>
                <p className="mt-1 text-sm font-medium break-all text-slate-800">{invoice.rideId}</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Passenger</p>
                <p className="mt-1 text-sm font-medium text-slate-800">{invoice.passenger?.name || '—'}</p>
                {invoice.passenger?.phone ? (
                  <p className="text-xs text-slate-500">{invoice.passenger.phone}</p>
                ) : null}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Driver</p>
                <p className="mt-1 text-sm font-medium text-slate-800">{invoice.driver?.name || '—'}</p>
                {invoice.driver?.phone ? (
                  <p className="text-xs text-slate-500">{invoice.driver.phone}</p>
                ) : null}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Vehicle</p>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {[ invoice.vehicle?.type, invoice.vehicle?.number ].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
            </div>

            {/* Trip */}
            <div className="border-t border-slate-200 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Trip</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-slate-400">Pickup</span>
                  <span className="font-medium text-slate-800">{invoice.pickup || '—'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-400">Drop-off</span>
                  <span className="font-medium text-slate-800">{invoice.drop || '—'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-400">Distance</span>
                  <span className="font-medium text-slate-800">
                    {invoice.distanceKm != null ? `${Number(invoice.distanceKm).toFixed(1)} km` : '—'}
                  </span>
                  <span className="ml-4 text-slate-400">Duration</span>
                  <span className="font-medium text-slate-800">{formatDuration(invoice.durationSec)}</span>
                </div>
              </div>
            </div>

            {/* Fare breakdown */}
            <div className="border-t border-slate-200 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Fare details</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Base / ride fare</span>
                  <span className="font-medium text-slate-800">{formatINR(invoice.fare)}</span>
                </div>
                {discount > 0 ? (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount{invoice.discountReason ? ` (${invoice.discountReason})` : ''}</span>
                    <span>−{formatINR(discount)}</span>
                  </div>
                ) : null}
                {invoice.serviceFee != null ? (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Service / platform fee</span>
                    <span className="font-medium text-slate-800">{formatINR(invoice.serviceFee)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-900">
                  <span>Total paid</span>
                  <span>{formatINR(total)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Payment method</span>
                  <span>{paymentLabel(invoice.paymentMethod)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Payment status</span>
                  <span>{invoice.paymentStatus === 'success' ? 'Paid' : 'Pending'}</span>
                </div>
                {invoice.rating != null ? (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Your rating</span>
                    <span>{invoice.rating}/5</span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Footer */}
            <div className="rounded-b-2xl border-t border-slate-200 bg-slate-50 px-6 py-4 text-center print:rounded-none">
              <p className="text-xs text-slate-500">
                Thank you for riding with RideEasy. This invoice was generated for your completed trip.
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
