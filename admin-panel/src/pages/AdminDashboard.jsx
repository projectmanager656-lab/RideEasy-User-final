import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminApi } from '../services/adminApi'
import { displayName } from '../admin/adminUtils'
import {
  OverviewTab,
  UsersTab,
  DriversTab,
  RidesTab,
  PaymentsTab,
  PricingTab,
} from '../admin/tabs'
import { useLanguage, LANGUAGE_OPTIONS } from '../i18n'

const TAB_LABELS = {
  analytics: 'overview',
  users: 'users',
  drivers: 'drivers',
  rides: 'rides',
  payments: 'payments',
  pricing: 'pricing',
}

const AdminDashboard = () => {
  const { t, language, setLanguage } = useLanguage()
  const navigate = useNavigate()
  const [langOpen, setLangOpen] = useState(false)
  const langRef = useRef(null)

  useEffect(() => {
    const click = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false)
    }
    window.addEventListener('mousedown', click)
    return () => window.removeEventListener('mousedown', click)
  }, [])

  const dataLoadedRef = useRef(new Set())
  const [statsNonce, setStatsNonce] = useState(0)

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
  const [rideStatusFilter, setRideStatusFilter] = useState('all')
  const [tableSearch, setTableSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [driversLoading, setDriversLoading] = useState(false)
  const [ridesLoading, setRidesLoading] = useState(false)
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [pricingLoading, setPricingLoading] = useState(false)
  const tableHeaderSelectRef = useRef(null)

  const silentRefreshAnalytics = useCallback(async () => {
    try {
      const d = await adminApi.getAnalytics()
      setAnalytics(d)
      dataLoadedRef.current.add('analytics')
    } catch {
      /* keep previous overview */
    }
  }, [])

  const refreshStats = useCallback(() => {
    dataLoadedRef.current.delete('analytics')
    setTab('analytics')
    setStatsNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    setSelectedIds([])
    setTableSearch('')
  }, [tab])

  const fmtErr = (e) => e?.response?.data?.message || e?.message || t('request_failed')

  /** Overview only — `statsNonce` bumps on "Refresh stats" without re-fetching rides/users/etc. */
  useEffect(() => {
    if (tab !== 'analytics') return
    if (dataLoadedRef.current.has('analytics')) {
      setAnalyticsLoading(false)
      return
    }
    const ac = new AbortController()
    const { signal } = ac
    ;(async () => {
      setAnalyticsError('')
      setAnalyticsLoading(true)
      try {
        const d = await adminApi.getAnalytics(signal)
        if (signal.aborted) return
        setAnalytics(d)
        dataLoadedRef.current.add('analytics')
      } catch (e) {
        if (signal.aborted) return
        setAnalytics(null)
        setAnalyticsError(fmtErr(e))
      } finally {
        if (!signal.aborted) setAnalyticsLoading(false)
      }
    })()
    return () => ac.abort()
  }, [tab, statsNonce])

  useEffect(() => {
    if (tab === 'analytics') return
    const ac = new AbortController()
    const { signal } = ac

    const run = async () => {
      if (tab === 'users') {
        if (dataLoadedRef.current.has('users')) return
        setUsersLoading(true)
        setTabError('')
        try {
          const list = await adminApi.getUsers(signal)
          if (signal.aborted) return
          setUsers(list)
          dataLoadedRef.current.add('users')
        } catch (e) {
          if (signal.aborted) return
          setTabError(fmtErr(e))
        } finally {
          if (!signal.aborted) setUsersLoading(false)
        }
        return
      }

      if (tab === 'drivers') {
        if (dataLoadedRef.current.has('drivers')) return
        setDriversLoading(true)
        setTabError('')
        try {
          const list = await adminApi.getDrivers(signal)
          if (signal.aborted) return
          setDrivers(list)
          dataLoadedRef.current.add('drivers')
        } catch (e) {
          if (signal.aborted) return
          setTabError(fmtErr(e))
        } finally {
          if (!signal.aborted) setDriversLoading(false)
        }
        return
      }

      if (tab === 'rides') {
        setRidesLoading(true)
        setTabError('')
        try {
          const list = await adminApi.getRides(rideStatusFilter, signal)
          if (signal.aborted) return
          setRides(list)
        } catch (e) {
          if (signal.aborted) return
          setTabError(fmtErr(e))
        } finally {
          if (!signal.aborted) setRidesLoading(false)
        }
        return
      }

      if (tab === 'payments') {
        if (dataLoadedRef.current.has('payments')) return
        setPaymentsLoading(true)
        setTabError('')
        try {
          const list = await adminApi.getPayments(signal)
          if (signal.aborted) return
          setPayments(list)
          dataLoadedRef.current.add('payments')
        } catch (e) {
          if (signal.aborted) return
          setTabError(fmtErr(e))
        } finally {
          if (!signal.aborted) setPaymentsLoading(false)
        }
        return
      }

      if (tab === 'pricing') {
        if (dataLoadedRef.current.has('pricing')) return
        setPricingLoading(true)
        setTabError('')
        try {
          const d = await adminApi.getPricing(signal)
          if (signal.aborted) return
          setPricingJson(JSON.stringify({
            rates: d.rates || {},
            driverPlans: d.driverPlans || {},
          }, null, 2))
          dataLoadedRef.current.add('pricing')
        } catch (e) {
          if (signal.aborted) return
          setPricingJson(JSON.stringify({ rates: {}, driverPlans: {} }, null, 2))
          setTabError(fmtErr(e))
        } finally {
          if (!signal.aborted) setPricingLoading(false)
        }
      }
    }

    run()
    return () => ac.abort()
  }, [tab, rideStatusFilter])

  const mergeDriver = (doc) => {
    if (!doc?._id) return
    const id = String(doc._id)
    setDrivers((list) => list.map((x) => (String(x._id) === id ? { ...x, ...doc } : x)))
  }

  const approveDriver = (driverId) => {
    adminApi.approveDriver(driverId)
      .then((data) => {
        const d = data?.driver
        if (d) mergeDriver(d)
      })
      .catch((e) => alert(e.response?.data?.message || t('failed')))
  }

  const rejectDriver = (driverId) => {
    if (!window.confirm(t('confirm_remove_driver_approval'))) return
    adminApi.rejectDriver(driverId)
      .then((data) => {
        const d = data?.driver
        if (d) mergeDriver(d)
      })
      .catch((e) => alert(e.response?.data?.message || t('failed')))
  }

  const toggleUserBlock = (userId, blocked) => {
    adminApi.patchUserBlock(userId, blocked)
      .then((data) => {
        const u = data?.user
        if (u?._id) {
          setUsers((list) => list.map((x) => (String(x._id) === String(u._id) ? { ...x, ...u } : x)))
        }
      })
      .catch((e) => alert(e.response?.data?.message || t('failed')))
  }

  const toggleDriverBlock = (driverId, blocked) => {
    adminApi.patchDriverBlock(driverId, blocked)
      .then((data) => {
        const d = data?.driver
        if (d) mergeDriver(d)
      })
      .catch((e) => alert(e.response?.data?.message || t('failed')))
  }

  const deleteUser = (userId) => {
    if (!window.confirm(t('confirm_delete_user'))) return
    adminApi.deleteUser(userId)
      .then(() => {
        setUsers((list) => list.filter((x) => String(x._id) !== String(userId)))
        silentRefreshAnalytics()
      })
      .catch((e) => alert(e.response?.data?.message || e.message || t('delete_failed')))
  }

  const deleteDriver = (driverId) => {
    if (!window.confirm(t('confirm_delete_driver'))) return
    adminApi.deleteDriver(driverId)
      .then(() => {
        setDrivers((list) => list.filter((x) => String(x._id) !== String(driverId)))
        silentRefreshAnalytics()
      })
      .catch((e) => alert(e.response?.data?.message || e.message || t('delete_failed')))
  }

  const deleteRide = (rideId) => {
    if (!window.confirm(t('confirm_delete_ride'))) return
    adminApi.deleteRide(rideId)
      .then(() => {
        setRides((list) => list.filter((x) => String(x._id) !== String(rideId)))
        setPayments((list) => list.filter((x) => String(x._id) !== String(rideId)))
        setSelectedIds((prev) => prev.filter((x) => x !== String(rideId)))
        silentRefreshAnalytics()
      })
      .catch((e) => alert(e.response?.data?.message || e.message || t('delete_failed')))
  }

  const filteredUsers = useMemo(() => {
    const q = tableSearch.trim().toLowerCase()
    const base = users.filter((u) => u && u._id)
    if (!q) return base
    return base.filter((u) => {
      const blob = [displayName(u.name), u.email, u.phone, u.city, String(u._id)].filter(Boolean).join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [users, tableSearch])

  const filteredDrivers = useMemo(() => {
    const q = tableSearch.trim().toLowerCase()
    const base = drivers.filter((d) => d && d._id)
    if (!q) return base
    return base.filter((d) => {
      const blob = [displayName(d.name), d.email, d.phone, d.city, d.vehicleType, d.vehicleNumber, String(d._id)]
        .filter(Boolean).join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [drivers, tableSearch])

  const filteredRides = useMemo(() => {
    const q = tableSearch.trim().toLowerCase()
    const base = rides.filter((r) => r && r._id)
    if (!q) return base
    return base.filter((r) => {
      const blob = [
        r.city, r.status, r.pickupLocation, r.dropLocation,
        displayName(r.user?.name), r.user?.phone, displayName(r.captain?.name), r.captain?.phone, r.captain?.vehicleNumber,
        String(r._id), String(r.price),
      ].filter(Boolean).join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [rides, tableSearch])

  const filteredPayments = useMemo(() => {
    const q = tableSearch.trim().toLowerCase()
    const base = payments.filter((p) => p && p._id)
    if (!q) return base
    return base.filter((p) => {
      const blob = [p.summary, p.city, p.paymentMode, p.paymentStatus, String(p._id), String(p.amount)]
        .filter(Boolean).join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [payments, tableSearch])

  const toggleSelect = (id) => {
    const s = String(id)
    setSelectedIds((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  const selectAllVisible = (rows) => {
    setSelectedIds(rows.map((row) => String(row._id)))
  }

  const clearSelection = () => setSelectedIds([])

  useEffect(() => {
    const el = tableHeaderSelectRef.current
    if (!el) return
    let visibleIds = []
    if (tab === 'users') visibleIds = filteredUsers.map((u) => String(u._id))
    else if (tab === 'drivers') visibleIds = filteredDrivers.map((d) => String(d._id))
    else if (tab === 'rides') visibleIds = filteredRides.map((r) => String(r._id))
    else if (tab === 'payments') visibleIds = filteredPayments.map((p) => String(p._id))
    const all = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
    const some = visibleIds.some((id) => selectedIds.includes(id))
    el.indeterminate = some && !all
  }, [tab, filteredUsers, filteredDrivers, filteredRides, filteredPayments, selectedIds])

  const bulkDeleteUsers = () => {
    const ids = selectedIds.filter((id) => users.some((u) => String(u._id) === id))
    if (ids.length === 0) return
    if (!window.confirm(t('confirm_bulk_delete_users', { count: ids.length }))) return
    Promise.all(ids.map((id) => adminApi.deleteUser(id)))
      .then(() => {
        setUsers((list) => list.filter((u) => !ids.includes(String(u._id))))
        clearSelection()
        silentRefreshAnalytics()
      })
      .catch((e) => alert(e.response?.data?.message || e.message || t('bulk_delete_failed')))
  }

  const bulkDeleteDrivers = () => {
    const ids = selectedIds.filter((id) => drivers.some((d) => String(d._id) === id))
    if (ids.length === 0) return
    if (!window.confirm(t('confirm_bulk_delete_drivers', { count: ids.length }))) return
    Promise.all(ids.map((id) => adminApi.deleteDriver(id)))
      .then(() => {
        setDrivers((list) => list.filter((d) => !ids.includes(String(d._id))))
        clearSelection()
        silentRefreshAnalytics()
      })
      .catch((e) => alert(e.response?.data?.message || e.message || t('bulk_delete_failed')))
  }

  const bulkDeleteRides = () => {
    const ids = selectedIds.filter((id) => rides.some((r) => String(r._id) === id))
    if (ids.length === 0) return
    if (!window.confirm(t('confirm_bulk_delete_rides', { count: ids.length }))) return
    Promise.all(ids.map((id) => adminApi.deleteRide(id)))
      .then(() => {
        setRides((list) => list.filter((r) => !ids.includes(String(r._id))))
        setPayments((list) => list.filter((p) => !ids.includes(String(p._id))))
        clearSelection()
        silentRefreshAnalytics()
      })
      .catch((e) => alert(e.response?.data?.message || e.message || t('bulk_delete_failed')))
  }

  const bulkDeletePayments = () => {
    bulkDeleteRides()
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
      adminApi.putPricing(payload)
        .then((d) => {
          setPricingJson(JSON.stringify({
            rates: d.rates || {},
            driverPlans: d.driverPlans || {},
          }, null, 2))
          alert(t('pricing_saved'))
        })
        .catch((e) => alert(e.response?.data?.message || t('failed')))
    } catch {
      alert(t('invalid_json'))
    }
  }

  const logout = () => {
    dataLoadedRef.current.clear()
    localStorage.removeItem('adminToken')
    navigate('/admin')
  }

  return (
    <div className="min-h-screen bg-white text-black font-sans">
      <nav className="sticky top-0 z-30 border-b border-black/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:gap-4 sm:px-4">
          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">RideEasy</p>
              <h1 className="text-base font-bold text-slate-900">{t('super_admin')}</h1>
            </div>
            <div className="sm:hidden">
              <h1 className="text-base font-bold text-slate-900">RE Admin</h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3">
            <div className="relative" ref={langRef}>
              <button
                type="button"
                onClick={() => setLangOpen(!langOpen)}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                  langOpen ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-neutral-300 bg-white text-slate-700 hover:border-slate-400'
                }`}
              >
                <i className="ri-translate-2 text-sm" />
                <span className="hidden min-[400px]:inline">{LANGUAGE_OPTIONS.find(o => o.code === language)?.label}</span>
                <i className={`ri-arrow-down-s-line transition-transform duration-200 ${langOpen ? 'rotate-180' : ''}`} />
              </button>

              {langOpen && (
                <div className="absolute right-0 mt-2 w-32 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.code}
                      onClick={() => {
                        setLanguage(opt.code)
                        setLangOpen(false)
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-xs transition-colors hover:bg-neutral-50 ${
                        opt.code === language ? 'bg-emerald-50 font-semibold text-emerald-600' : 'text-slate-700'
                      }`}
                    >
                      {opt.label}
                      {opt.code === language && <i className="ri-check-line text-sm" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={refreshStats}
              className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-neutral-50 sm:px-3"
            >
              <i className="ri-refresh-line sm:mr-1" />
              <span className="hidden sm:inline">{t('refresh')}</span>
            </button>

            <button type="button" onClick={logout} className="text-xs font-semibold text-slate-500 hover:text-red-600 px-1 py-1">
              {t('logout')}
            </button>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
        <div className="mb-4 sm:mb-6 max-w-3xl rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 sm:px-5 sm:py-4">
          <p className="text-base sm:text-lg font-semibold text-black">{t('welcome_super_admin')}</p>
          <p className="mt-1 text-xs sm:text-sm text-neutral-600">
            {t('signed_in_with_admin_jwt')} (<code className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[10px] sm:text-xs font-mono text-black">role: admin</code>).
            {t('console_covers_text')}
          </p>
        </div>

        <div className="mb-4 sm:mb-6 flex flex-wrap gap-2 overflow-x-auto pb-2 -mx-3 px-3 sm:mx-0 sm:px-0 sm:pb-0">
          {['analytics', 'users', 'drivers', 'rides', 'payments', 'pricing'].map((tabId) => (
            <button
              key={tabId}
              type="button"
              onClick={() => setTab(tabId)}
              className={`rounded-lg px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium transition flex-shrink-0 ${
                tab === tabId
                  ? 'bg-black text-white shadow-sm'
                  : 'border border-neutral-300 bg-white text-neutral-700 hover:border-black hover:text-black'
              }`}
            >
              {t(TAB_LABELS[tabId] || tabId)}
            </button>
          ))}
        </div>

        {tabError && (
          <div className="mb-4 rounded-xl border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900">
            {tabError}
          </div>
        )}

        {tab === 'analytics' && (
          <OverviewTab
            analytics={analytics}
            analyticsLoading={analyticsLoading}
            analyticsError={analyticsError}
          />
        )}

        {tab === 'users' && (
          <UsersTab
            usersLoading={usersLoading}
            filteredUsers={filteredUsers}
            users={users}
            tableSearch={tableSearch}
            setTableSearch={setTableSearch}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            selectAllVisible={selectAllVisible}
            clearSelection={clearSelection}
            tableHeaderSelectRef={tableHeaderSelectRef}
            toggleUserBlock={toggleUserBlock}
            deleteUser={deleteUser}
            bulkDeleteUsers={bulkDeleteUsers}
          />
        )}

        {tab === 'drivers' && (
          <DriversTab
            driversLoading={driversLoading}
            filteredDrivers={filteredDrivers}
            drivers={drivers}
            tableSearch={tableSearch}
            setTableSearch={setTableSearch}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            selectAllVisible={selectAllVisible}
            clearSelection={clearSelection}
            tableHeaderSelectRef={tableHeaderSelectRef}
            approveDriver={approveDriver}
            rejectDriver={rejectDriver}
            toggleDriverBlock={toggleDriverBlock}
            deleteDriver={deleteDriver}
            bulkDeleteDrivers={bulkDeleteDrivers}
          />
        )}

        {tab === 'rides' && (
          <RidesTab
            ridesLoading={ridesLoading}
            filteredRides={filteredRides}
            rides={rides}
            rideStatusFilter={rideStatusFilter}
            setRideStatusFilter={setRideStatusFilter}
            tableSearch={tableSearch}
            setTableSearch={setTableSearch}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            selectAllVisible={selectAllVisible}
            clearSelection={clearSelection}
            tableHeaderSelectRef={tableHeaderSelectRef}
            deleteRide={deleteRide}
            bulkDeleteRides={bulkDeleteRides}
          />
        )}

        {tab === 'payments' && (
          <PaymentsTab
            paymentsLoading={paymentsLoading}
            filteredPayments={filteredPayments}
            payments={payments}
            tableSearch={tableSearch}
            setTableSearch={setTableSearch}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            selectAllVisible={selectAllVisible}
            clearSelection={clearSelection}
            tableHeaderSelectRef={tableHeaderSelectRef}
            deleteRide={deleteRide}
            bulkDeletePayments={bulkDeletePayments}
          />
        )}

        {tab === 'pricing' && (
          <PricingTab
            pricingJson={pricingJson}
            setPricingJson={setPricingJson}
            savePricing={savePricing}
            pricingLoading={pricingLoading}
          />
        )}
      </div>
    </div>
  )
}

export default AdminDashboard
