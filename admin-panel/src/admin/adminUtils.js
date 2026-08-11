/** Safe list from API envelope (avoids blank tables on odd shapes). */
export function normalizeListResponse (envelope, listKey) {
  if (envelope == null) return []
  if (typeof envelope !== 'object') return []
  if (Array.isArray(envelope)) {
    return envelope
      .filter((x) => x != null && typeof x === 'object')
      .map(normalizeRowId)
  }
  const raw = envelope[listKey] ?? envelope.data?.[listKey]
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => item != null && typeof item === 'object')
    .map(normalizeRowId)
}

export function normalizeRowId (item) {
  const id = item._id ?? item.id
  if (id == null || id === '') return item
  return { ...item, _id: id }
}

export function rowStableKey (item, index) {
  const id = item?._id ?? item?.id
  if (id != null && id !== '') return String(id)
  return `row-${index}`
}

/** DB may store `name` as a string or as { firstname, middlename, lastname }. */
export function displayName (v) {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'object' && !Array.isArray(v)) {
    const first = v.firstname ?? v.firstName ?? v.first_name ?? ''
    const mid = v.middlename ?? v.middleName ?? v.middle_name ?? ''
    const last = v.lastname ?? v.lastName ?? v.last_name ?? ''
    const parts = [first, mid, last].map((x) => (typeof x === 'string' ? x.trim() : String(x || '').trim())).filter(Boolean)
    if (parts.length) return parts.join(' ')
    if (typeof v.name === 'string') return v.name.trim()
    if (typeof v.fullName === 'string') return v.fullName.trim()
  }
  return ''
}

export function statusBadgeClass (status) {
  const s = String(status || '').toLowerCase()
  if (s === 'completed') return 'bg-neutral-200 text-black border-neutral-400'
  if (s === 'cancelled') return 'bg-neutral-100 text-neutral-600 border-neutral-300'
  if (s === 'searching') return 'bg-neutral-100 text-black border-neutral-300'
  if (s === 'started') return 'bg-white text-neutral-800 border-neutral-300'
  return 'bg-white text-neutral-600 border-neutral-200'
}

export function paymentStatusClass (st) {
  const s = String(st || '').toLowerCase()
  if (s === 'success') return 'text-black font-medium'
  if (s === 'failed') return 'text-neutral-500'
  return 'text-neutral-600'
}

export const RIDE_STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'searching', label: 'Searching' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'arrived', label: 'Arrived' },
  { value: 'started', label: 'Started' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]
