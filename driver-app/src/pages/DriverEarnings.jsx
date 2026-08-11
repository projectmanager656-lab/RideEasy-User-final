import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient, withCaptainAuth } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'
import { formatApiError } from '../utils/apiError'

const DriverEarnings = () => {
  const [ earnings, setEarnings ] = useState(null)
  const [ error, setError ] = useState('')
  const [ loading, setLoading ] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    apiClient.get('/captains/earnings', withCaptainAuth())
      .then((res) => {
        if (cancelled) return
        setEarnings(stripApiEnvelope(res.data))
      })
      .catch((err) => {
        if (!cancelled) setError(formatApiError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-dvh min-h-screen bg-black text-white pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-800 bg-black/90 px-4 py-3 backdrop-blur">
        <Link to="/captain-home" className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-zinc-200">
          <i className="ri-arrow-left-line text-lg" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold">Earnings</h1>
          <p className="text-xs text-zinc-400">Wallet & trip totals</p>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 pt-6">
        {error ? (
          <div role="alert" className="rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : earnings ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-lg">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Total earned</p>
              <p className="mt-1 text-3xl font-bold text-emerald-400">₹{earnings.totalEarnings ?? 0}</p>
              <p className="mt-2 text-sm text-zinc-400">
                {earnings.count ?? earnings.completedRides ?? 0} completed rides
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
              <p className="text-xs text-zinc-500">Wallet balance</p>
              <p className="text-xl font-semibold text-white">₹{earnings.walletBalance ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
              <p className="text-xs text-zinc-500">Today</p>
              <p className="text-lg font-medium text-white">
                ₹{earnings.todayEarnings ?? 0} · {earnings.todayRides ?? 0} rides
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">No earnings data.</p>
        )}
      </div>
    </div>
  )
}

export default DriverEarnings
