import React from 'react'
import { rowStableKey, paymentStatusClass } from '../adminUtils'

export default function PaymentsTab ({
  paymentsLoading,
  filteredPayments,
  payments,
  tableSearch,
  setTableSearch,
  selectedIds,
  toggleSelect,
  selectAllVisible,
  clearSelection,
  tableHeaderSelectRef,
  deleteRide,
  bulkDeletePayments,
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
      <p className="border-b border-neutral-200 px-4 py-2 text-xs text-neutral-500">Completed ride settlements (from ride records)</p>
      {paymentsLoading ? (
        <div className="p-12 text-center text-neutral-600">Loading payments…</div>
      ) : (
        <>
          <div className="flex flex-col gap-3 border-b border-neutral-200 px-3 py-3 sm:px-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <input
              type="search"
              placeholder="Search ride id, summary, amount, status…"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="w-full max-w-full sm:max-w-md rounded-lg border border-neutral-300 bg-white text-black px-3 py-2 text-sm placeholder:text-neutral-500 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            />
            {selectedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-neutral-600">{selectedIds.length} selected</span>
                <button type="button" onClick={clearSelection} className="text-xs text-neutral-600 hover:text-black">Clear</button>
                <button type="button" onClick={bulkDeletePayments} className="rounded-lg border border-black bg-black px-2 py-1.5 sm:px-3 text-xs font-medium text-white hover:bg-neutral-800">Delete selected rides</button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] sm:min-w-[1000px] text-left text-sm text-neutral-900">
              <thead className="border-b border-neutral-200 bg-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="w-10 px-2 py-3">
                    <input
                      ref={tableHeaderSelectRef}
                      type="checkbox"
                      className="h-4 w-4 rounded border-neutral-400 bg-white text-black border-neutral-400 focus:ring-black"
                      checked={filteredPayments.length > 0 && filteredPayments.every((p) => selectedIds.includes(String(p._id)))}
                      onChange={(e) => (e.target.checked ? selectAllVisible(filteredPayments) : clearSelection())}
                    />
                  </th>
                  <th className="px-4 py-3">Completed</th>
                  <th className="px-4 py-3">Ride</th>
                  <th className="px-4 py-3 text-right">Charged ₹</th>
                  <th className="px-4 py-3 text-right">Driver net ₹</th>
                  <th className="px-4 py-3 text-right">Platform ₹</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredPayments.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-neutral-500">
                      {payments.length === 0 ? 'No completed payments yet.' : 'No rows match your search.'}
                    </td>
                  </tr>
                )}
                {filteredPayments.map((p, idx) => (
                  <tr key={rowStableKey(p, idx)} className="hover:bg-neutral-100">
                    <td className="px-2 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-neutral-400 bg-white text-black border-neutral-400 focus:ring-black"
                        checked={selectedIds.includes(String(p._id))}
                        onChange={() => toggleSelect(p._id)}
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-neutral-500">
                      {p.completedAt ? new Date(p.completedAt).toLocaleString() : (p.createdAt ? new Date(p.createdAt).toLocaleString() : '—')}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-xs text-neutral-600">
                      <span className="line-clamp-2">{p.summary || p.city || '—'}</span>
                      <span className="mt-1 block font-mono text-[10px] text-neutral-600">{String(p._id)}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-black">₹{p.amount ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{p.captainNetEarning != null ? `₹${p.captainNetEarning}` : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{p.platformFee != null ? `₹${p.platformFee}` : '—'}</td>
                    <td className="px-4 py-3 text-neutral-600">{p.paymentMode || '—'}</td>
                    <td className={`px-4 py-3 text-sm font-medium ${paymentStatusClass(p.paymentStatus)}`}>
                      {p.paymentStatus || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="text-sm font-medium text-neutral-600 underline hover:text-black"
                        onClick={() => deleteRide(p._id)}
                      >
                        Delete ride
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
