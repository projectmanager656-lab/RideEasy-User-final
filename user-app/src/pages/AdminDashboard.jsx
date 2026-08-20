import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { stripApiEnvelope } from '../utils/apiBody'
import { getAdminAnalytics, getAdminUsers, getAdminDrivers, getAdminRides, getAdminPayments, getAdminPricing, putAdminPricing, approveDriver, rejectDriver, blockUser, blockDriver } from '../services/adminService'

const TAB_LABELS = {
  analytics: 'Overview',
  users: 'Users',
  drivers: 'Drivers',
  rides: 'Rides',
  payments: 'Payments',
  pricing: 'Pricing',
}

const RIDE_STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'searching', label: 'Searching' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'arrived', label: 'Arrived' },
  { value: 'started', label: 'Started' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

function statusBadgeClass (status) {
  const s = String(status || '').toLowerCase()
  if (s === 'completed') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  if (s === 'cancelled') return 'bg-red-500/15 text-red-300 border-red-500/30'
  if (s === 'searching') return 'bg-amber-500/15 text-amber-200 border-amber-500/30'
  if (s === 'started') return 'bg-sky-500/15 text-sky-200 border-sky-500/30'
  return 'bg-slate-500/15 text-slate-300 border-slate-500/30'
}

function paymentStatusClass (st) {
  const s = String(st || '').toLowerCase()
  if (s === 'success') return 'text-emerald-400'
  if (s === 'failed') return 'text-red-400'
  return 'text-amber-300'
}

const AdminDashboard = () => {
  const navigate = useNavigate()
  const [analytics, setAnalytics] = useState(null)
  const [analyticsError, setAnalyticsError] = useState('')
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [drivers, setDrivers] = useState([])
  const [rides, setRides] = useState([])
  const [payments, setPayments] = useState([])
  const [pricingJson, setPricingJson] = useState('')
  const [tab, setTab] = useState('analytics')
  const [tabError, setTabError] = useState('')
  const [rideStatusFilter, setRideStatusFilter] = useState('')

  const loadAnalytics = useCallback(() => {
    setAnalyticsError('')
    setAnalyticsLoading(true)
    getAdminAnalytics()
      .then((data) => {
        setAnalytics(stripApiEnvelope(data))
        setAnalyticsError('')
      })
      .catch((err) => {
        setAnalytics(null)
        setAnalyticsError(err.response?.data?.message || err.message || 'Could not load analytics.')
      })
      .finally(() => setAnalyticsLoading(false))
  }, [])

  useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

  useEffect(() => {
    setTabError('')
    if (tab === 'users') {
      getAdminUsers()
        .then((d) => {
          setUsers(Array.isArray(d) ? d : (d.users || []))
        })
        .catch((e) => setTabError(e.response?.data?.message || e.message || 'Failed'))
    } else if (tab === 'drivers') {
      getAdminDrivers()
        .then((d) => {
          setDrivers(Array.isArray(d) ? d : (d.drivers || []))
        })
        .catch((e) => setTabError(e.response?.data?.message || e.message || 'Failed'))
    } else if (tab === 'rides') {
      getAdminRides(rideStatusFilter)
        .then((d) => {
          setRides(Array.isArray(d) ? d : (d.rides || []))
        })
        .catch((e) => setTabError(e.response?.data?.message || e.message || 'Failed'))
    } else if (tab === 'payments') {
      getAdminPayments()
        .then((d) => {
          setPayments(Array.isArray(d) ? d : (d.payments || []))
        })
        .catch((e) => setTabError(e.response?.data?.message || e.message || 'Failed'))
    } else if (tab === 'pricing') {
      getAdminPricing()
        .then((d) => {
          setPricingJson(JSON.stringify({
            rates: d.rates || {},
            driverPlans: d.driverPlans || {},
          }, null, 2))
        })
        .catch((e) => {
          setPricingJson(JSON.stringify({ rates: {}, driverPlans: {} }, null, 2))
          setTabError(e.response?.data?.message || e.message || 'Failed to load pricing')
        })
    }
  }, [tab, rideStatusFilter])

  const mergeDriver = (doc) => {
    if (!doc?._id) return
    const id = String(doc._id)
    setDrivers((list) => list.map((x) => (String(x._id) === id ? { ...x, ...doc } : x)))
  }

  const approveDriverAction = (driverId) => {
    approveDriver(driverId)
      .then((data) => {
        const d = stripApiEnvelope(data).driver
        if (d) mergeDriver(d)
      })
      .catch((e) => alert(e.response?.data?.message || 'Failed'))
  }

  const rejectDriverAction = (driverId) => {
    if (!window.confirm('Remove driver approval? They will need approval again before going online.')) return
    rejectDriver(driverId)
      .then((data) => {
        const d = stripApiEnvelope(data).driver
        if (d) mergeDriver(d)
      })
      .catch((e) => alert(e.response?.data?.message || 'Failed'))
  }

  const toggleUserBlock = (userId, blocked) => {
    blockUser(userId, blocked)
      .then((data) => {
        const u = stripApiEnvelope(data).user
        if (u?._id) {
          setUsers((list) => list.map((x) => (String(x._id) === String(u._id) ? { ...x, ...u } : x)))
        }
      })
      .catch((e) => alert(e.response?.data?.message || 'Failed'))
  }

  const toggleDriverBlock = (driverId, blocked) => {
    blockDriver(driverId, blocked)
      .then((data) => {
        const d = stripApiEnvelope(data).driver
        if (d) mergeDriver(d)
      })
      .catch((e) => alert(e.response?.data?.message || 'Failed'))
  }

  const savePricing = () => {
    try {
      const parsed = JSON.parse(pricingJson)
      const payload =
        parsed.rates != null && typeof parsed.rates === 'object'
          ? {
              rates: parsed.rates,
              ...(parsed.driverPlans && typeof parsed.driverPlans === 'object'
                ? { driverPlans: parsed.driverPlans }
                : {}),
            }
          : { rates: parsed }
      putAdminPricing(payload)
        .then((data) => {
          const d = stripApiEnvelope(data)
          setPricingJson(JSON.stringify({
            rates: d.rates || {},
            driverPlans: d.driverPlans || {},
          }, null, 2))
          alert('Pricing saved')
        })
        .catch((e) => alert(e.response?.data?.message || 'Failed'))
    } catch {
      alert('Invalid JSON')
    }
  }

  const logout = () => {
    localStorage.removeItem('adminToken')
    navigate('/admin')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400/90">RideEasy</p>
            <h1 className="text-lg font-semibold text-white">Admin console</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadAnalytics}
              className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              Refresh stats
            </button>
            <Link to="/" className="text-sm text-slate-400 hover:text-white">Site</Link>
            <button type="button" onClick={logout} className="text-sm font-medium text-red-300 hover:text-red-200">
              Log out
            </button>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <p className="mb-6 max-w-3xl text-sm text-slate-400">
          All routes require an admin JWT (<code className="rounded bg-slate-800 px-1 text-xs text-emerald-300">role: admin</code>).
          Data: users, drivers (captains), rides, payments from completed rides, pricing.
        </p>

        <div className="mb-6 flex flex-wrap gap-2">
          {['analytics', 'users', 'drivers', 'rides', 'payments', 'pricing'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === t
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'
                  : 'border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:text-white'
              }`}
            >
              {TAB_LABELS[t] || t}
            </button>
          ))}
        </div>

        {analyticsError && (
          <div className="mb-4 rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {analyticsError}
          </div>
        )}
        {tabError && (
          <div className="mb-4 rounded-xl border border-amber-800 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            {tabError}
          </div>
        )}

        {tab === 'analytics' && analyticsLoading && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-12 text-center text-slate-400">
            Loading overview…
          </div>
        )}

        {tab === 'analytics' && !analyticsLoading && analytics && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
                      ? 'border-emerald-500/40 bg-emerald-950/20'
                      : 'border-slate-800 bg-slate-900/60'
                  }`}
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-white">{card.value}</p>
                  <p className="mt-1 text-xs text-slate-500">{card.sub}</p>
                </div>
              ))}
            </div>

            {(analytics.completedRideCount != null || analytics.completedWithCaptainCount != null) && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-400">
                Completed rides: <span className="font-semibold text-slate-200">{analytics.completedRideCount ?? '—'}</span>
                {' · '}With captain assigned:{' '}
                <span className="font-semibold text-slate-200">{analytics.completedWithCaptainCount ?? '—'}</span>
              </div>
            )}

            {analytics.cityAnalytics && (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-300">By city</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {[ 'Kolhapur', 'Ichalkaranji', 'Sangli' ].map((city) => (
                    <div key={city} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                      <p className="font-medium text-emerald-400">{city}</p>
                      <p className="mt-2 text-sm text-slate-400">
                        Rides: <span className="text-slate-200">{analytics.cityAnalytics[city]?.rides ?? 0}</span>
                        {' · '}Drivers: <span className="text-slate-200">{analytics.cityAnalytics[city]?.drivers ?? 0}</span>
                        {' · '}Fare total: ₹<span className="tabular-nums text-slate-200">{analytics.cityAnalytics[city]?.revenue ?? 0}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'users' && (
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">City</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {users.map((u) => (
                    <tr key={u._id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-medium text-slate-200">{u.name}</td>
                      <td className="px-4 py-3 text-slate-400">{u.email}</td>
                      <td className="px-4 py-3 text-slate-400">{u.phone}</td>
                      <td className="px-4 py-3 text-slate-400">{u.city || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.blocked ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                          {u.blocked ? 'Blocked' : 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="font-medium text-emerald-400 hover:text-emerald-300"
                          onClick={() => toggleUserBlock(u._id, !u.blocked)}
                        >
                          {u.blocked ? 'Unblock' : 'Block'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'drivers' && (
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 shadow-xl">
            <p className="border-b border-slate-800 px-4 py-2 text-xs text-slate-500">Approve new drivers or revoke approval. Use Block for abuse.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Driver</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">City / Vehicle</th>
                    <th className="px-4 py-3">Subscription</th>
                    <th className="px-4 py-3 text-right">Rides</th>
                    <th className="px-4 py-3 text-right">Income ₹</th>
                    <th className="px-4 py-3">Flags</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {drivers.map((d) => {
                    const subStatus = d.effectiveSubscriptionStatus || d.subscriptionStatus
                    return (
                      <tr key={d._id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-medium text-slate-200">{d.name}</td>
                        <td className="px-4 py-3 text-slate-400">{d.email}</td>
                        <td className="px-4 py-3 text-slate-400">
                          {d.city || '—'}
                          <span className="block text-xs text-slate-500">{d.vehicleType} {d.vehicleNumber}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            subStatus === 'active' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700 text-slate-300'
                          }`}
                          >
                            {subStatus || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-300">{d.completedRides ?? 0}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-200">{d.driverIncome ?? 0}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          {d.approved ? <span className="text-emerald-400">Approved</span> : <span className="text-amber-400">Pending</span>}
                          {d.blocked ? <span className="ml-2 text-red-400">Blocked</span> : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {!d.approved && (
                              <button type="button" onClick={() => approveDriverAction(d._id)} className="text-left text-sm font-medium text-emerald-400 hover:text-emerald-300">
                                Approve
                              </button>
                            )}
                            {d.approved && (
                              <button type="button" onClick={() => rejectDriverAction(d._id)} className="text-left text-sm font-medium text-amber-400 hover:text-amber-300">
                                Reject
                              </button>
                            )}
                            <button type="button" onClick={() => toggleDriverBlock(d._id, !d.blocked)} className="text-left text-sm text-slate-400 hover:text-white">
                              {d.blocked ? 'Unblock' : 'Block'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'rides' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-slate-400">
                Filter
                <select
                  value={rideStatusFilter}
                  onChange={(e) => setRideStatusFilter(e.target.value)}
                  className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                >
                  {RIDE_STATUSES.map((o) => (
                    <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">When</th>
                      <th className="px-4 py-3">City</th>
                      <th className="px-4 py-3">Passenger</th>
                      <th className="px-4 py-3">Driver</th>
                      <th className="px-4 py-3">Route</th>
                      <th className="px-4 py-3 text-right">₹</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {rides.map((r) => (
                      <tr key={r._id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                          {r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{r.city || '—'}</td>
                        <td className="px-4 py-3 text-slate-400">
                          {r.user?.name || '—'}
                          <span className="block text-xs text-slate-500">{r.user?.phone || ''}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {r.captain?.name || '—'}
                          <span className="block text-xs text-slate-500">{r.captain?.vehicleNumber || r.captain?.phone || ''}</span>
                        </td>
                        <td className="max-w-xs px-4 py-3 text-slate-400">
                          <span className="line-clamp-2">{r.pickupLocation}</span>
                          <span className="text-slate-600"> → </span>
                          <span className="line-clamp-2">{r.dropLocation}</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-200">₹{r.price ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(r.status)}`}>
                            {r.status || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'payments' && (
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 shadow-xl">
            <p className="border-b border-slate-800 px-4 py-2 text-xs text-slate-500">Completed ride settlements (from ride records)</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Completed</th>
                    <th className="px-4 py-3">Ride</th>
                    <th className="px-4 py-3 text-right">Charged ₹</th>
                    <th className="px-4 py-3 text-right">Driver net ₹</th>
                    <th className="px-4 py-3 text-right">Platform ₹</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {payments.map((p) => (
                    <tr key={p._id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {p.completedAt ? new Date(p.completedAt).toLocaleString() : (p.createdAt ? new Date(p.createdAt).toLocaleString() : '—')}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-xs text-slate-400">
                        <span className="line-clamp-2">{p.summary || p.city || '—'}</span>
                        <span className="mt-1 block font-mono text-[10px] text-slate-600">{String(p._id)}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-200">₹{p.amount ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-400">{p.captainNetEarning != null ? `₹${p.captainNetEarning}` : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-400">{p.platformFee != null ? `₹${p.platformFee}` : '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{p.paymentMode || '—'}</td>
                      <td className={`px-4 py-3 text-sm font-medium ${paymentStatusClass(p.paymentStatus)}`}>
                        {p.paymentStatus || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'pricing' && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl">
            <p className="mb-3 text-sm text-slate-400">
              JSON with <code className="rounded bg-slate-800 px-1 text-emerald-300">rates</code> (per-vehicle{' '}
              <code className="rounded bg-slate-800 px-1 text-emerald-300">baseFare</code>,{' '}
              <code className="rounded bg-slate-800 px-1 text-emerald-300">perKm</code>,{' '}
              <code className="rounded bg-slate-800 px-1 text-emerald-300">platformFee</code>) and{' '}
              <code className="rounded bg-slate-800 px-1 text-emerald-300">driverPlans</code> (weekly/monthly/yearly ₹ per vehicle type). Both are stored in MongoDB.
            </p>
            <textarea
              className="h-72 w-full rounded-xl border border-slate-700 bg-slate-950 p-4 font-mono text-sm text-slate-200 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              value={pricingJson}
              onChange={(e) => setPricingJson(e.target.value)}
            />
            <button
              type="button"
              onClick={savePricing}
              className="mt-4 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Save pricing
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminDashboard
