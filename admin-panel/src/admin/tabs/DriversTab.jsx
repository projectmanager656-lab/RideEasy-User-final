import React from 'react'
import { displayName, rowStableKey } from '../adminUtils'
import { useLanguage } from '../../i18n'

export default function DriversTab ({
  driversLoading,
  filteredDrivers,
  drivers,
  tableSearch,
  setTableSearch,
  selectedIds,
  toggleSelect,
  selectAllVisible,
  clearSelection,
  tableHeaderSelectRef,
  approveDriver,
  rejectDriver,
  toggleDriverBlock,
  deleteDriver,
  bulkDeleteDrivers,
}) {
  const { t } = useLanguage()

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
      <p className="border-b border-neutral-200 px-4 py-2 text-xs text-neutral-500">{t('drivers_tab_hint')}</p>
      {driversLoading ? (
        <div className="p-12 text-center text-neutral-600">{t('loading_drivers')}</div>
      ) : (
        <>
          <div className="flex flex-col gap-3 border-b border-neutral-200 px-3 py-3 sm:px-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <input
              type="search"
              placeholder={t('search_drivers_placeholder')}
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="w-full max-w-full sm:max-w-md rounded-lg border border-neutral-300 bg-white text-black px-3 py-2 text-sm placeholder:text-neutral-500 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            />
            {selectedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-neutral-600">{t('selected_count', { count: selectedIds.length })}</span>
                <button type="button" onClick={clearSelection} className="text-xs text-neutral-600 hover:text-black">{t('clear')}</button>
                <button type="button" onClick={bulkDeleteDrivers} className="rounded-lg border border-black bg-black px-2 py-1.5 sm:px-3 text-xs font-medium text-white hover:bg-neutral-800">{t('delete_selected')}</button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] sm:min-w-[1040px] text-left text-sm text-neutral-900">
              <thead className="border-b border-neutral-200 bg-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="w-10 px-2 py-3">
                    <input
                      ref={tableHeaderSelectRef}
                      type="checkbox"
                      className="h-4 w-4 rounded border-neutral-400 bg-white text-black border-neutral-400 focus:ring-black"
                      checked={filteredDrivers.length > 0 && filteredDrivers.every((d) => selectedIds.includes(String(d._id)))}
                      onChange={(e) => (e.target.checked ? selectAllVisible(filteredDrivers) : clearSelection())}
                    />
                  </th>
                  <th className="px-4 py-3">{t('driver_col')}</th>
                  <th className="px-4 py-3">{t('email_col')}</th>
                  <th className="px-4 py-3">{t('city_vehicle_col')}</th>
                  <th className="px-4 py-3">{t('subscription_col')}</th>
                  <th className="px-4 py-3 text-right">{t('rides_col')}</th>
                  <th className="px-4 py-3 text-right">{t('income_col')}</th>
                  <th className="px-4 py-3">{t('flags_col')}</th>
                  <th className="px-4 py-3">{t('actions_col')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredDrivers.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-neutral-500">
                      {drivers.length === 0 ? t('no_drivers_yet') : t('no_drivers_match')}
                    </td>
                  </tr>
                )}
                {filteredDrivers.map((d, idx) => {
                  const subStatus = d.effectiveSubscriptionStatus || d.subscriptionStatus
                  return (
                    <tr key={rowStableKey(d, idx)} className="hover:bg-neutral-100">
                      <td className="px-2 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-neutral-400 bg-white text-black border-neutral-400 focus:ring-black"
                          checked={selectedIds.includes(String(d._id))}
                          onChange={() => toggleSelect(d._id)}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-black">{displayName(d.name) || '—'}</td>
                      <td className="px-4 py-3 text-neutral-600">{d.email}</td>
                      <td className="px-4 py-3 text-neutral-600">
                        {d.city || '—'}
                        <span className="block text-xs text-neutral-500">{d.vehicleType} {d.vehicleNumber}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          subStatus === 'active' ? 'bg-black text-white' : 'bg-neutral-200 text-neutral-800'
                        }`}
                        >
                          {subStatus || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{d.completedRides ?? 0}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-black">{d.driverIncome ?? 0}</td>
                      <td className="px-4 py-3 text-xs text-neutral-600">
                        {d.approved ? <span className="text-black font-medium">{t('approved_status')}</span> : <span className="text-neutral-600">{t('pending_status')}</span>}
                        {d.blocked ? <span className="ml-2 text-neutral-600 border border-black/20 rounded px-1">{t('blocked_status')}</span> : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {!d.approved && (
                            <button type="button" onClick={() => approveDriver(d._id)} className="text-left text-sm font-medium text-black underline decoration-neutral-400 hover:decoration-black">
                              {t('approve')}
                            </button>
                          )}
                          {d.approved && (
                            <button type="button" onClick={() => rejectDriver(d._id)} className="text-left text-sm font-medium text-neutral-700 underline hover:text-black">
                              {t('reject')}
                            </button>
                          )}
                          <button type="button" onClick={() => toggleDriverBlock(d._id, !d.blocked)} className="text-left text-sm text-neutral-600 hover:text-black">
                            {d.blocked ? t('unblock') : t('block')}
                          </button>
                          <button type="button" onClick={() => deleteDriver(d._id)} className="text-left text-sm font-medium text-neutral-600 underline hover:text-black">
                            {t('delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
