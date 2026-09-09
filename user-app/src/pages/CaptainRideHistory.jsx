import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient, withCaptainAuth } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { stripApiEnvelope } from '../utils/apiBody'

function statusStyle (status) {
  const s = String(status || '').toLowerCase()
  if (s === 'completed') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (s === 'cancelled') return 'bg-slate-100 text-slate-700 border-slate-200'
  if (s === 'started') return 'bg-blue-100 text-blue-800 border-blue-200'
  return 'bg-amber-100 text-amber-900 border-amber-200'
}

const CaptainRideHistory = () => {
  const [ rides, setRides ] = useState([])
  const [ loading, setLoading ] = useState(true)
  const [ error, setError ] = useState('')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const loadRides = useCallback(() => {
    setLoading(true)
    setError('')
    return apiClient
      .get('/captains/rides/history', withCaptainAuth({ params: { limit: 50 } }))
      .then((res) => {
        if (!mountedRef.current) return
        const raw = stripApiEnvelope(res.data)
        const list = Array.isArray(raw?.rides) ? raw.rides : (Array.isArray(raw) ? raw : [])
        setRides(list)
      })
      .catch((err) => {
        if (!mountedRef.current) return
        setError(formatApiError(err))
      })
      .finally(() => {
        if (!mountedRef.current) return
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    loadRides()
  }, [loadRides])

  return (
    <div className="min-h-dvh min-h-screen w-full max-w-full overflow-x-hidden bg-slate-950 text-slate-50 pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-800 bg-slate-950/95 px-3 py-3 backdrop-blur sm:gap-3 sm:px-4">
        <Link to="/captain-home" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-200">
          <i className="ri-arrow-left-line text-lg" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold sm:text-lg">Trip history</h1>
          <p className="text-xs text-slate-400">Your completed and past rides</p>
        </div>
        <button
          type="button"
          onClick={() => loadRides()}
          disabled={loading}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          aria-label="Refresh list"
        >
          <i className={`ri-refresh-line text-lg ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <div className="mx-auto w-full max-w-lg px-3 pt-4 sm:px-4">
        {loading && rides.length === 0 && <p className="text-sm text-slate-400">Loading…</p>}
        {error ? (
          <div role="alert" className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}
        {!loading && !error && rides.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-6 text-center">
            <p className="text-sm text-slate-400">No trips yet. When you complete rides, they show up here.</p>
            <Link to="/captain-home" className="mt-4 inline-block text-sm font-medium text-emerald-400 hover:text-emerald-300">
              Back to dashboard
            </Link>
          </div>
        )}
        <ul className="mt-3 space-y-3">
          {rides.map((r) => {
            const passenger = r.user && typeof r.user === 'object' ? r.user : null
            const earnings = r.captainNetEarning != null ? r.captainNetEarning : r.price
            return (
              <li
                key={r._id}
                className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${statusStyle(r.status)}`}>
                    {r.status || '—'}
                  </span>
                  <span className="text-sm font-semibold text-emerald-400">
                    ₹{earnings ?? '—'}
                    {r.price != null && r.captainNetEarning != null && Number(r.price) !== Number(r.captainNetEarning) ? (
                      <span className="ml-1 text-xs font-normal text-slate-500">fare ₹{r.price}</span>
                    ) : null}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {r.completedAt
                    ? new Date(r.completedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                    : r.createdAt
                      ? new Date(r.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                      : ''}
                </p>
                <div className="mt-2 space-y-1 text-sm break-words">
                  <p className="text-slate-300">
                    <span className="text-slate-500">Pickup · </span>
                    {r.pickupLocation || '—'}
                  </p>
                  <p className="text-slate-300">
                    <span className="text-slate-500">Drop · </span>
                    {r.dropLocation || '—'}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  {r.vehicleType ? <span>{String(r.vehicleType)}</span> : null}
                  {r.paymentMethod ? <span>{String(r.paymentMethod)}</span> : null}
                </div>
                {passenger?.name ? (
                  <p className="mt-2 text-xs text-slate-500">Passenger · {passenger.name}</p>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export default CaptainRideHistory
