/** Passenger-friendly labels (maps backend ride.status). */
export function passengerRideStatusLabel (status) {
  const s = String(status || '').trim().toLowerCase()
  const map = {
    searching: 'Finding driver',
    accepted: 'Driver assigned',
    arrived: 'Driver arrived',
    started: 'Trip in progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }
  return map[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Pending')
}

export function passengerRideStatusBadgeClass (status) {
  const s = String(status || '').toLowerCase()
  if (s === 'completed') return 'border-emerald-700 bg-emerald-950/50 text-emerald-300'
  if (s === 'cancelled') return 'border-zinc-600 bg-zinc-900 text-zinc-400'
  if (s === 'started') return 'border-sky-700 bg-sky-950/40 text-sky-300'
  if (s === 'accepted' || s === 'arrived') return 'border-amber-700 bg-amber-950/40 text-amber-200'
  return 'border-zinc-600 bg-zinc-900 text-zinc-300'
}
