import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, withAuth } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'
import { formatApiError } from '../utils/apiError'
import { useUserData } from '../context/UserContext'
import {
  getEmergencyContacts,
  saveEmergencyContacts,
  getSafetyPrefs,
  setSafetyPref,
} from '../utils/safetyData'

const USER_RIDE_SESSION_KEY = 'rideeasy_user_ride'

function activeRideId () {
  try {
    return sessionStorage.getItem(USER_RIDE_SESSION_KEY) || null
  } catch { return null }
}

/** Live active ride (if any) + driver info, from the same endpoint Home uses. */
function useActiveRide () {
  const [ride, setRide] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    const id = activeRideId()
    if (!id) {
      setRide(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    apiClient
      .get(`/rides/${id}`, withAuth())
      .then((res) => {
        if (cancelled) return
        const data = stripApiEnvelope(res.data)
        setRide(data?.ride || data)
      })
      .catch((err) => {
        if (cancelled) return
        setError(formatApiError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [nonce])

  return { ride, loading, error, reload: () => setNonce((n) => n + 1) }
}

const Section = ({ title, icon, children }) => (
  <section className="rounded-2xl border border-brand-border bg-brand-card p-4">
    <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
      <i className={`${icon} text-brand-yellow`} aria-hidden />
      {title}
    </h2>
    {children}
  </section>
)

const RideSafetyGuidelines = () => {
  const items = [
    'Verify the vehicle number before entering.',
    "Verify the driver's name and vehicle details.",
    'Make sure the vehicle matches the information shown in the app.',
    'Never share your OTP or security code with anyone outside the legitimate RideEasy ride flow.',
    'Share your trip with a trusted contact when needed.',
    'Contact support if something feels unsafe.',
  ]
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-sm text-zinc-300">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
            <i className="ri-check-line text-xs" aria-hidden />
          </span>
          {item}
        </li>
      ))}
    </ul>
  )
}

const ToggleRow = ({ label, detail, checked, onToggle }) => (
  <label className="flex cursor-pointer items-center justify-between gap-3 py-2.5">
    <span className="min-w-0">
      <span className="block text-sm font-medium text-white">{label}</span>
      <span className="block text-xs text-zinc-400">{detail}</span>
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-brand-yellow' : 'bg-zinc-700'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  </label>
)

const emptyForm = () => ({ name: '', phone: '', relationship: '', primary: false })

const EmergencyContactsSection = () => {
  const [contacts, setContacts] = useState(getEmergencyContacts)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [error, setError] = useState('')

  const openAdd = () => {
    setEditingId(null)
    setForm(emptyForm())
    setError('')
    setFormOpen(true)
  }

  const openEdit = (c) => {
    setEditingId(c.id)
    setForm({ name: c.name, phone: c.phone, relationship: c.relationship, primary: c.primary })
    setError('')
    setFormOpen(true)
  }

  const save = () => {
    const name = form.name.trim()
    const phone = form.phone.trim()
    if (!name || !phone) {
      setError('Please enter a name and phone number.')
      return
    }
    let next
    if (editingId) {
      next = contacts.map((c) => (
        c.id === editingId ? { ...c, name, phone, relationship: form.relationship.trim(), primary: form.primary } : c
      ))
    } else {
      const entry = { id: `c${Date.now()}${Math.random().toString(36).slice(2, 6)}`, name, phone, relationship: form.relationship.trim(), primary: form.primary }
      // First contact is the primary by default.
      next = [ ...contacts, { ...entry, primary: contacts.length === 0 ? true : form.primary } ]
    }
    setContacts(next)
    saveEmergencyContacts(next)
    setFormOpen(false)
  }

  const remove = (id) => {
    const next = contacts.filter((c) => c.id !== id)
    // Keep at least one primary.
    if (next.length > 0 && !next.some((c) => c.primary)) next[0].primary = true
    setContacts(next)
    saveEmergencyContacts(next)
  }

  const setPrimary = (id) => {
    const next = contacts.map((c) => ({ ...c, primary: c.id === id }))
    setContacts(next)
    saveEmergencyContacts(next)
  }

  return (
    <Section title="Emergency Contacts" icon="ri-group-line">
      <p className="mb-3 text-sm text-zinc-400">Manage people who can be contacted during an emergency.</p>

      {contacts.length === 0 ? (
        <p className="mb-3 rounded-xl border border-dashed border-brand-border bg-brand-card/40 px-3 py-4 text-center text-sm text-zinc-500">
          No emergency contacts yet.
        </p>
      ) : (
        <ul className="mb-3 space-y-2">
          {contacts.map((c) => (
            <li key={c.id} className="rounded-xl border border-brand-border bg-brand-cardSoft/60 px-3.5 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
                    <i className="ri-user-3-line text-base" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{c.name}</p>
                    <p className="text-xs text-zinc-400">{c.phone}</p>
                    {c.relationship && <p className="text-xs text-zinc-500">{c.relationship}</p>}
                  </div>
                </div>
                {c.primary && (
                  <span className="rounded-full bg-brand-yellow/15 px-2 py-0.5 text-[10px] font-semibold text-brand-yellow">
                    Primary
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => openEdit(c)} className="rounded-full border border-brand-border px-3 py-1 text-xs text-zinc-300 active:scale-95">Edit</button>
                <button type="button" onClick={() => setPrimary(c.id)} className="rounded-full border border-brand-border px-3 py-1 text-xs text-zinc-300 active:scale-95">Set primary</button>
                <button type="button" onClick={() => remove(c.id)} className="rounded-full border border-red-500/40 px-3 py-1 text-xs text-red-400 active:scale-95">Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={openAdd}
        className="w-full rounded-xl border border-brand-yellow bg-brand-yellow/10 py-2.5 text-sm font-semibold text-brand-yellow active:scale-[0.99]"
      >
        + Add Emergency Contact
      </button>

      {formOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-sm rounded-2xl border border-brand-border bg-[#101010] p-4">
            <h3 className="mb-3 text-base font-bold text-white">{editingId ? 'Edit Contact' : 'Add Emergency Contact'}</h3>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Mom"
              className="mb-3 w-full rounded-xl border border-brand-border bg-brand-card px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-brand-yellow"
            />
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">Phone Number</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+91 XXXXX XXXXX"
              inputMode="tel"
              className="mb-3 w-full rounded-xl border border-brand-border bg-brand-card px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-brand-yellow"
            />
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">Relationship</label>
            <input
              value={form.relationship}
              onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))}
              placeholder="e.g. Sister"
              className="mb-3 w-full rounded-xl border border-brand-border bg-brand-card px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-brand-yellow"
            />
            <label className="mb-3 flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={form.primary}
                onChange={(e) => setForm((f) => ({ ...f, primary: e.target.checked }))}
                className="h-4 w-4 accent-[#FFC800]"
              />
              Set as primary contact
            </label>
            {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setFormOpen(false)} className="flex-1 rounded-xl border border-brand-border bg-brand-card py-3 text-sm font-semibold text-white active:scale-[0.98]">Cancel</button>
              <button type="button" onClick={save} className="flex-1 rounded-xl bg-brand-yellow py-3 text-sm font-bold text-black active:scale-[0.98]">Save Contact</button>
            </div>
          </div>
        </div>
      )}
    </Section>
  )
}

/** Prepare a share-ready summary of the current trip. */
function buildShareText (ride) {
  if (!ride) return ''
  const status = String(ride.status || 'active')
  const lines = [
    'RideEasy trip',
    `Status: ${status}`,
    ride.pickupLocation ? `Pickup: ${ride.pickupLocation}` : null,
    ride.dropLocation ? `Destination: ${ride.dropLocation}` : null,
  ]
  const captain = ride.captain || {}
  if (captain.name) lines.push(`Driver: ${captain.name}`)
  if (captain.vehicleNumber) lines.push(`Vehicle: ${captain.vehicleNumber}`)
  if (ride.etaMinutes != null) lines.push(`ETA: ~${ride.etaMinutes} min`)
  return lines.filter(Boolean).join('\n')
}

const ShareTripSection = ({ ride, error }) => {
  const [toast, setToast] = useState('')

  const doShare = async () => {
    if (!ride) {
      setToast('No active ride to share.')
      return
    }
    const text = buildShareText(ride)
    const canNative = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    if (canNative) {
      try {
        await navigator.share({ text })
        return
      } catch { /* user cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(text)
      setToast('Trip details copied to clipboard.')
    } catch {
      setToast('Unable to share. Please copy the details manually.')
    }
    setTimeout(() => setToast(''), 3000)
  }

  return (
    <Section title="Share Trip" icon="ri-share-forward-line">
      <p className="mb-3 text-sm text-zinc-400">Share your current trip information with someone you trust.</p>
      {!ride && <p className="mb-3 text-sm text-zinc-500">{error ? 'Unable to load ride information.' : 'No active ride to share.'}</p>}
      <button
        type="button"
        onClick={doShare}
        className="w-full rounded-xl border border-brand-yellow bg-brand-yellow/10 py-2.5 text-sm font-semibold text-brand-yellow active:scale-[0.99]"
      >
        Share Trip
      </button>
      {toast && <p className="mt-2 text-center text-xs text-brand-yellow">{toast}</p>}
    </Section>
  )
}

const DriverVerificationSection = ({ ride, loading, error }) => {
  const captain = ride?.captain || {}
  const hasDriver = !!(ride && (captain.name || ride.vehicleType || captain.vehicleNumber))
  return (
    <Section title="Driver & Vehicle Verification" icon="ri-user-lock-line">
      <p className="mb-3 text-sm text-zinc-400">Verify your driver and vehicle before starting your ride.</p>
      {!hasDriver ? (
        <p className="text-sm text-zinc-500">
          {loading ? 'Loading ride information...' : (error ? 'Unable to load ride information.' : 'Driver verification will be available when you have an active ride.')}
        </p>
      ) : (
        <div className="space-y-2">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
              <i className="ri-shield-check-line" aria-hidden /> Verified Driver
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">Driver identity and vehicle details have been verified.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {captain.name && (
              <>
                <span className="text-zinc-500">Driver Name</span><span className="text-right font-medium text-white">{captain.name}</span>
              </>
            )}
            {captain.rating != null && (
              <>
                <span className="text-zinc-500">Rating</span>
                <span className="text-right font-medium text-amber-400">★ {Number(captain.rating).toFixed(1)}</span>
              </>
            )}
            {ride.vehicleType && (
              <>
                <span className="text-zinc-500">Vehicle Type</span><span className="text-right font-medium text-white">{String(ride.vehicleType)}</span>
              </>
            )}
            {captain.vehicleNumber && (
              <>
                <span className="text-zinc-500">Vehicle Number</span><span className="text-right font-medium text-white">{captain.vehicleNumber}</span>
              </>
            )}
          </div>
        </div>
      )}
    </Section>
  )
}

const SafetyPreferencesSection = () => {
  const [prefs, setPrefs] = useState(getSafetyPrefs)
  const update = (key) => {
    const next = setSafetyPref(key, !prefs[key])
    setPrefs(next)
  }
  return (
    <Section title="Safety Preferences" icon="ri-lock-2-line">
      <div className="divide-y divide-brand-border">
        <ToggleRow label="Share trip automatically" detail="Share trip details automatically with contacts" checked={prefs.shareTripAutomatically} onToggle={() => update('shareTripAutomatically')} />
        <ToggleRow label="Share live location" detail="Share live location during an active ride" checked={prefs.shareLiveLocation} onToggle={() => update('shareLiveLocation')} />
        <ToggleRow label="Safety notifications" detail="Get notifications about your ride safety" checked={prefs.safetyNotifications} onToggle={() => update('safetyNotifications')} />
      </div>
    </Section>
  )
}

const Safety = () => {
  const navigate = useNavigate()
  const { user } = useUserData()
  const { ride, loading, error, reload } = useActiveRide()
  const [sosConfirm, setSosConfirm] = useState(false)
  const [sosActive, setSosActive] = useState(false)

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/home')
  }

  return (
    <div className="min-h-dvh min-h-screen w-full overflow-x-hidden bg-black text-white pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-800 bg-black/90 px-3 py-3 backdrop-blur sm:gap-3 sm:px-4">
        <button type="button" onClick={handleBack} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-200 active:scale-95" aria-label="Back">
          <i className="ri-arrow-left-line text-lg" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">Safety</h1>
        <button type="button" onClick={reload} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-200" aria-label="Refresh">
          <i className={`ri-refresh-line text-lg ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <div className="mx-auto w-full max-w-lg space-y-4 px-3 pt-4 sm:px-4">
        {/* SOS */}
        {!sosActive ? (
          <section className="rounded-2xl border border-red-500/40 bg-gradient-to-b from-red-950/40 to-brand-card p-4">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
              <i className="ri-alarm-warning-line text-brand-yellow" aria-hidden />
              Emergency / SOS
            </h2>
            <p className="mb-4 mt-1 text-sm text-zinc-300">Get immediate help.</p>
            <button
              type="button"
              onClick={() => setSosConfirm(true)}
              className="w-full rounded-xl bg-brand-yellow py-4 text-base font-extrabold text-black active:scale-[0.98]"
            >
              SOS / EMERGENCY
            </button>
          </section>
        ) : (
          <section className="rounded-2xl border border-red-500/60 bg-red-950/40 p-4 text-center">
            <i className="ri-radio-button-line text-5xl animate-pulse text-brand-yellow" aria-hidden />
            <h2 className="mt-3 text-xl font-extrabold text-white">SOS Activated</h2>
            <p className="mt-1 text-sm text-zinc-300">
              Emergency contacts have been alerted{user?.name ? ` for ${user.name}` : ''}.
            </p>
            {/* Integration point: call the real emergency API / notify contacts here. */}
            <p className="mt-2 text-xs text-zinc-500">Emergency service integration is not yet connected.</p>
            <button
              type="button"
              onClick={() => setSosActive(false)}
              className="mt-4 w-full rounded-xl border border-brand-border bg-brand-card py-3 text-sm font-semibold text-white active:scale-[0.98]"
            >
              Deactivate SOS
            </button>
          </section>
        )}

        <EmergencyContactsSection />

        <ShareTripSection ride={ride} error={error} />

        <Section title="Ride Safety" icon="ri-shield-check-line">
          <RideSafetyGuidelines />
        </Section>

        <DriverVerificationSection ride={ride} loading={loading} error={error} />

        <SafetyPreferencesSection />
      </div>

      {/* SOS confirmation */}
      {sosConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-sm rounded-2xl border border-brand-border bg-[#101010] p-4 text-center">
            <i className="ri-alarm-warning-line text-4xl text-brand-yellow" aria-hidden />
            <h3 className="mt-2 text-lg font-bold text-white">Activate Emergency SOS?</h3>
            <p className="mt-1 text-sm text-zinc-300">Are you sure you want to activate Emergency SOS?</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setSosConfirm(false)} className="flex-1 rounded-xl border border-brand-border bg-brand-card py-3 text-sm font-semibold text-white active:scale-[0.98]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setSosConfirm(false)
                  setSosActive(true)
                }}
                className="flex-1 rounded-xl bg-brand-yellow py-3 text-sm font-bold text-black active:scale-[0.98]"
              >
                Activate SOS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Safety