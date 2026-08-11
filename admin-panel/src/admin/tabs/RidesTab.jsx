import React from 'react'
import { displayName, rowStableKey, statusBadgeClass, RIDE_STATUSES } from '../adminUtils'

export default function RidesTab ({
  ridesLoading,
  filteredRides,
  rides,
  rideStatusFilter,
  setRideStatusFilter,
  tableSearch,
  setTableSearch,
  selectedIds,
  toggleSelect,
  selectAllVisible,
  clearSelection,
  tableHeaderSelectRef,
  deleteRide,
  bulkDeleteRides,
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-3 sm:px-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-neutral-600">
            Status
            <select
              value={rideStatusFilter}
              onChange={(e) => setRideStatusFilter(e.target.value)}
              className="ml-2 rounded-lg border border-neutral-300 bg-white text-black px-3 py-2 text-sm"
            >
              {RIDE_STATUSES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
        <input
          type="search"
          placeholder="Search city, route, passenger, driver, id…"
          value={tableSearch}
          onChange={(e) => setTableSearch(e.target.value)}
          className="w-full max-w-full sm:max-w-md rounded-lg border border-neutral-300 bg-white text-black px-3 py-2 text-sm placeholder:text-neutral-500 focus:border-black focus:outline-none focus:ring-1 focus:ring-black sm:ml-auto"
        />
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-600">{selectedIds.length} selected</span>
            <button type="button" onClick={clearSelection} className="text-xs text-neutral-600 hover:text-black">Clear</button>
            <button type="button" onClick={bulkDeleteRides} className="rounded-lg border border-black bg-black px-2 py-1.5 sm:px-3 text-xs font-medium text-white hover:bg-neutral-800">Delete selected</button>
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
        {ridesLoading ? (
          <div className="p-12 text-center text-neutral-600">Loading rides…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] sm:min-w-[960px] text-left text-sm text-neutral-900">
              <thead className="border-b border-neutral-200 bg-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="w-10 px-2 py-3">
                    <input
                      ref={tableHeaderSelectRef}
                      type="checkbox"
                      className="h-4 w-4 rounded border-neutral-400 bg-white text-black border-neutral-400 focus:ring-black"
                      checked={filteredRides.length > 0 && filteredRides.every((r) => selectedIds.includes(String(r._id)))}
                      onChange={(e) => (e.target.checked ? selectAllVisible(filteredRides) : clearSelection())}
                    />
                  </th>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Passenger</th>
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3 text-right">₹</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {!ridesLoading && filteredRides.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-neutral-500">
                      {rides.length === 0
                        ? 'No rides in the database yet. Pick All under Status, or check the backend connection.'
                        : 'No rides match your search or filter.'}
                    </td>
                  </tr>
                )}
                {filteredRides.map((r, idx) => (
                  <tr key={rowStableKey(r, idx)} className="hover:bg-neutral-100">
                    <td className="px-2 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-neutral-400 bg-white text-black border-neutral-400 focus:ring-black"
                        checked={selectedIds.includes(String(r._id))}
                        onChange={() => toggleSelect(r._id)}
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-neutral-500">
                      {r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{r.city || '—'}</td>
                    <td className="px-4 py-3 text-neutral-600">
                      {displayName(r.user?.name) || '—'}
                      <span className="block text-xs text-neutral-500">{r.user?.phone || ''}</span>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {displayName(r.captain?.name) || '—'}
                      <span className="block text-xs text-neutral-500">{r.captain?.vehicleNumber || r.captain?.phone || ''}</span>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-neutral-600">
                      <span className="line-clamp-2">{r.pickupLocation ?? '—'}</span>
                      <span className="text-neutral-600"> → </span>
                      <span className="line-clamp-2">{r.dropLocation ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-black">₹{r.price ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(r.status)}`}>
                        {r.status || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="text-sm font-medium text-neutral-600 underline hover:text-black"
                        onClick={() => deleteRide(r._id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
