import React from 'react'
import { displayName, rowStableKey } from '../adminUtils'

export default function UsersTab ({
  usersLoading,
  filteredUsers,
  users,
  tableSearch,
  setTableSearch,
  selectedIds,
  toggleSelect,
  selectAllVisible,
  clearSelection,
  tableHeaderSelectRef,
  toggleUserBlock,
  deleteUser,
  bulkDeleteUsers,
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
      {usersLoading ? (
        <div className="p-12 text-center text-neutral-600">Loading users…</div>
      ) : (
        <>
          <div className="flex flex-col gap-3 border-b border-neutral-200 px-3 py-3 sm:px-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <input
              type="search"
              placeholder="Search name, email, phone, city…"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="w-full max-w-full sm:max-w-md rounded-lg border border-neutral-300 bg-white text-black px-3 py-2 text-sm placeholder:text-neutral-500 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            />
            {selectedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-neutral-600">{selectedIds.length} selected</span>
                <button type="button" onClick={clearSelection} className="text-xs text-neutral-600 hover:text-black">Clear</button>
                <button type="button" onClick={bulkDeleteUsers} className="rounded-lg border border-black bg-black px-2 py-1.5 sm:px-3 text-xs font-medium text-white hover:bg-neutral-800">Delete selected</button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] sm:min-w-[760px] text-left text-sm text-neutral-900">
              <thead className="border-b border-neutral-200 bg-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="w-10 px-2 py-3">
                    <input
                      ref={tableHeaderSelectRef}
                      type="checkbox"
                      className="h-4 w-4 rounded border-neutral-400 bg-white text-black border-neutral-400 focus:ring-black"
                      checked={filteredUsers.length > 0 && filteredUsers.every((u) => selectedIds.includes(String(u._id)))}
                      onChange={(e) => (e.target.checked ? selectAllVisible(filteredUsers) : clearSelection())}
                    />
                  </th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                      {users.length === 0 ? 'No users yet.' : 'No users match your search.'}
                    </td>
                  </tr>
                )}
                {filteredUsers.map((u, idx) => (
                  <tr key={rowStableKey(u, idx)} className="hover:bg-neutral-100">
                    <td className="px-2 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-neutral-400 bg-white text-black border-neutral-400 focus:ring-black"
                        checked={selectedIds.includes(String(u._id))}
                        onChange={() => toggleSelect(u._id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-black">{displayName(u.name) || '—'}</td>
                    <td className="px-4 py-3 text-neutral-600">{u.email}</td>
                    <td className="px-4 py-3 text-neutral-600">{u.phone}</td>
                    <td className="px-4 py-3 text-neutral-600">{u.city || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.blocked ? 'border border-black/30 bg-neutral-100 text-black' : 'bg-black text-white'}`}>
                        {u.blocked ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="font-medium text-black underline decoration-neutral-400 hover:decoration-black"
                          onClick={() => toggleUserBlock(u._id, !u.blocked)}
                        >
                          {u.blocked ? 'Unblock' : 'Block'}
                        </button>
                        <button
                          type="button"
                          className="font-medium text-neutral-600 hover:text-black underline"
                          onClick={() => deleteUser(u._id)}
                        >
                          Delete
                        </button>
                      </div>
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
