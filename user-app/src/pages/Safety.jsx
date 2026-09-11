import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, withAuth } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'
import { formatApiError } from '../utils/apiError'
import { useUserData } from '../context/UserContext'
import { useLanguage } from '../i18n'
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
  <section className="rounded-2xl border border-theme bg-theme-card p-4">
    <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-theme-primary">
      <i className={`${icon} text-brand-yellow`} aria-hidden />
      {title}
    </h2>
    {children}
  </section>
)

const RIDE_GUIDELINE_KEYS = [
  'ride_guideline_1',
  'ride_guideline_2',
  'ride_guideline_3',
  'ride_guideline_4',
  'ride_guideline_5',
  'ride_guideline_6',
]

const RideSafetyGuidelines = () => {
  const { t } = useLanguage()
  return (
    <ul className="space-y-2.5">
      {RIDE_GUIDELINE_KEYS.map((key) => (
        <li key={key} className="flex items-start gap-2.5 text-sm text-theme-primary">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
            <i className="ri-check-line text-xs" aria-hidden />
          </span>
          {t(key)}
        </li>
      ))}
    </ul>
  )
}

const ToggleRow = ({ label, detail, checked, onToggle }) => (
  <label className="flex cursor-pointer items-center justify-between gap-3 py-2.5">
    <span className="min-w-0">
      <span className="block text-sm font-medium text-theme-primary">{label}</span>
      <span className="block text-xs text-theme-secondary">{detail}</span>
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-brand-yellow' : 'bg-theme-muted'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  </label>
)

const emptyForm = () => ({ name: '', phone: '', relationship: '', primary: false })

const EmergencyContactsSection = () => {
  const { t } = useLanguage()
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
      setError(t('contact_required_error'))
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
    <Section title={t('emergency_contact')} icon="ri-group-line">
      <p className="mb-3 text-sm text-theme-secondary">{t('manage_emergency_contacts')}</p>

      {contacts.length === 0 ? (
        <p className="mb-3 rounded-xl border border-dashed border-theme bg-theme-card px-3 py-4 text-center text-sm text-theme-muted">
          {t('no_emergency_contacts')}
        </p>
      ) : (
        <ul className="mb-3 space-y-2">
          {contacts.map((c) => (
            <li key={c.id} className="rounded-xl border border-theme bg-theme-card-muted px-3.5 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
                    <i className="ri-user-3-line text-base" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-theme-primary">{c.name}</p>
                    <p className="text-xs text-theme-secondary">{c.phone}</p>
                    {c.relationship && <p className="text-xs text-theme-muted">{c.relationship}</p>}
                  </div>
                </div>
                {c.primary && (
                  <span className="rounded-full bg-brand-yellow/15 px-2 py-0.5 text-[10px] font-semibold text-brand-yellow">
                    {t('primary')}
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => openEdit(c)} className="rounded-full border border-theme px-3 py-1 text-xs text-theme-primary active:scale-95">{t('edit')}</button>
                <button type="button" onClick={() => setPrimary(c.id)} className="rounded-full border border-theme px-3 py-1 text-xs text-theme-primary active:scale-95">{t('set_primary')}</button>
                <button type="button" onClick={() => remove(c.id)} className="rounded-full border border-red-500/40 px-3 py-1 text-xs text-red-400 active:scale-95">{t('remove')}</button>
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
        + {t('add_emergency_contact')}
      </button>

      {formOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-sm rounded-2xl border border-theme bg-theme-card p-4">
            <h3 className="mb-3 text-base font-bold text-theme-primary">{editingId ? t('edit_contact') : t('add_emergency_contact')}</h3>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-theme-secondary">{t('name')}</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('name_placeholder')}
              className="mb-3 w-full rounded-xl border border-theme bg-theme-card px-3 py-2.5 text-sm text-theme-primary placeholder:text-theme-muted outline-none focus:border-brand-yellow"
            />
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-theme-secondary">{t('phone_number')}</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+91 XXXXX XXXXX"
              inputMode="tel"
              className="mb-3 w-full rounded-xl border border-theme bg-theme-card px-3 py-2.5 text-sm text-theme-primary placeholder:text-theme-muted outline-none focus:border-brand-yellow"
            />
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-theme-secondary">{t('relationship')}</label>
            <input
              value={form.relationship}
              onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))}
              placeholder={t('relationship_placeholder')}
              className="mb-3 w-full rounded-xl border border-theme bg-theme-card px-3 py-2.5 text-sm text-theme-primary placeholder:text-theme-muted outline-none focus:border-brand-yellow"
            />
            <label className="mb-3 flex items-center gap-2 text-sm text-theme-primary">
              <input
                type="checkbox"
                checked={form.primary}
                onChange={(e) => setForm((f) => ({ ...f, primary: e.target.checked }))}
                className="h-4 w-4 accent-[#FFC800]"
              />
              {t('set_primary_contact')}
            </label>
            {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setFormOpen(false)} className="flex-1 rounded-xl border border-theme bg-theme-card py-3 text-sm font-semibold text-theme-primary active:scale-[0.98]">{t('cancel')}</button>
              <button type="button" onClick={save} className="flex-1 rounded-xl bg-brand-yellow py-3 text-sm font-bold text-black active:scale-[0.98]">{t('save_contact')}</button>
            </div>
          </div>
        </div>
      )}
    </Section>
  )
}

/** Prepare a share-ready summary of the current trip. */
function buildShareText (ride, t) {
  if (!ride) return ''
  const status = String(ride.status || 'active')
  const lines = [
    t('rideeasy_trip'),
    t('share_line_status', { status }),
    ride.pickupLocation ? t('share_line_pickup', { place: ride.pickupLocation }) : null,
    ride.dropLocation ? t('share_line_destination', { place: ride.dropLocation }) : null,
  ]
  const captain = ride.captain || {}
  if (captain.name) lines.push(t('share_line_driver', { name: captain.name }))
  if (captain.vehicleNumber) lines.push(t('share_line_vehicle', { number: captain.vehicleNumber }))
  if (ride.etaMinutes != null) lines.push(t('share_line_eta', { minutes: ride.etaMinutes }))
  return lines.filter(Boolean).join('\n')
}

const ShareTripSection = ({ ride, error }) => {
  const { t } = useLanguage()
  const [toast, setToast] = useState('')

  const doShare = async () => {
    if (!ride) {
      setToast(t('no_active_ride_to_share'))
      return
    }
    const text = buildShareText(ride, t)
    const canNative = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    if (canNative) {
      try {
        await navigator.share({ text })
        return
      } catch { /* user cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(text)
      setToast(t('copied_to_clipboard'))
    } catch {
      setToast(t('unable_to_share'))
    }
    setTimeout(() => setToast(''), 3000)
  }

  return (
    <Section title={t('share_trip')} icon="ri-share-forward-line">
      <p className="mb-3 text-sm text-theme-secondary">{t('share_trip_hint')}</p>
      {!ride && <p className="mb-3 text-sm text-theme-muted">{error ? t('unable_load_ride_info') : t('no_active_ride_to_share')}</p>}
      <button
        type="button"
        onClick={doShare}
        className="w-full rounded-xl border border-brand-yellow bg-brand-yellow/10 py-2.5 text-sm font-semibold text-brand-yellow active:scale-[0.99]"
      >
        {t('share_trip')}
      </button>
      {toast && <p className="mt-2 text-center text-xs text-brand-yellow">{toast}</p>}
    </Section>
  )
}

const DriverVerificationSection = ({ ride, loading, error }) => {
  const { t } = useLanguage()
  const captain = ride?.captain || {}
  const hasDriver = !!(ride && (captain.name || ride.vehicleType || captain.vehicleNumber))
  return (
    <Section title={t('driver_verification')} icon="ri-user-lock-line">
      <p className="mb-3 text-sm text-theme-secondary">{t('verify_driver_hint')}</p>
      {!hasDriver ? (
        <p className="text-sm text-theme-muted">
          {loading ? t('loading_ride_info') : (error ? t('unable_load_ride_info') : t('driver_verification_available'))}
        </p>
      ) : (
        <div className="space-y-2">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
              <i className="ri-shield-check-line" aria-hidden /> {t('verified_driver')}
            </p>
            <p className="mt-0.5 text-xs text-theme-secondary">{t('driver_verified_detail')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {captain.name && (
              <>
                <span className="text-theme-muted">{t('driver_name')}</span><span className="text-right font-medium text-theme-primary">{captain.name}</span>
              </>
            )}
            {captain.rating != null && (
              <>
                <span className="text-theme-muted">{t('rating')}</span>
                <span className="text-right font-medium text-amber-400">★ {Number(captain.rating).toFixed(1)}</span>
              </>
            )}
            {ride.vehicleType && (
              <>
                <span className="text-theme-muted">{t('vehicle_type')}</span><span className="text-right font-medium text-theme-primary">{String(ride.vehicleType)}</span>
              </>
            )}
            {captain.vehicleNumber && (
              <>
                <span className="text-theme-muted">{t('vehicle_number')}</span><span className="text-right font-medium text-theme-primary">{captain.vehicleNumber}</span>
              </>
            )}
          </div>
        </div>
      )}
    </Section>
  )
}

const SafetyPreferencesSection = () => {
  const { t } = useLanguage()
  const [prefs, setPrefs] = useState(getSafetyPrefs)
  const update = (key) => {
    const next = setSafetyPref(key, !prefs[key])
    setPrefs(next)
  }
  return (
    <Section title={t('safety_preferences')} icon="ri-lock-2-line">
      <div className="divide-y divide-theme">
        <ToggleRow label={t('pref_share_trip_auto')} detail={t('pref_share_trip_auto_detail')} checked={prefs.shareTripAutomatically} onToggle={() => update('shareTripAutomatically')} />
        <ToggleRow label={t('pref_share_location')} detail={t('pref_share_location_detail')} checked={prefs.shareLiveLocation} onToggle={() => update('shareLiveLocation')} />
        <ToggleRow label={t('pref_safety_notifications')} detail={t('pref_safety_notifications_detail')} checked={prefs.safetyNotifications} onToggle={() => update('safetyNotifications')} />
      </div>
    </Section>
  )
}

const Safety = () => {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { user } = useUserData()
  const { ride, loading, error, reload } = useActiveRide()
  const [sosConfirm, setSosConfirm] = useState(false)
  const [sosActive, setSosActive] = useState(false)

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/home')
  }

  return (
    <div className="min-h-dvh min-h-screen w-full overflow-x-hidden bg-theme-bg text-theme-primary pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-theme bg-theme-bg/90 px-4 pt-4 pb-3 backdrop-blur">
        <button type="button" onClick={handleBack} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-theme bg-theme-card text-brand active:scale-95" aria-label={t('back')}>
          <i className="ri-arrow-left-line text-2xl" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-2xl font-extrabold tracking-tight">{t('safety')}</h1>
        <button type="button" onClick={reload} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-theme-card text-theme-primary" aria-label={t('refresh')}>
          <i className={`ri-refresh-line text-lg ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <div className="mx-auto w-full max-w-lg space-y-4 px-3 pt-4 sm:px-4">
        {/* SOS */}
        {!sosActive ? (
          <section className="rounded-2xl border border-red-500/40 bg-gradient-to-b from-red-950/40 to-theme-card p-4">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-theme-primary">
              <i className="ri-alarm-warning-line text-brand-yellow" aria-hidden />
              {t('sos_emergency')}
            </h2>
            <p className="mb-4 mt-1 text-sm text-theme-primary">{t('get_immediate_help')}</p>
            <button
              type="button"
              onClick={() => setSosConfirm(true)}
              className="w-full rounded-xl bg-brand-yellow py-4 text-base font-extrabold text-black active:scale-[0.98]"
            >
              {t('sos_button')}
            </button>
          </section>
        ) : (
          <section className="rounded-2xl border border-red-500/60 bg-red-950/40 p-4 text-center">
            <i className="ri-radio-button-line text-5xl animate-pulse text-brand-yellow" aria-hidden />
            <h2 className="mt-3 text-xl font-extrabold text-theme-primary">{t('sos_activated')}</h2>
            <p className="mt-1 text-sm text-theme-primary">
              {t('sos_contacts_alerted', { forName: user?.name ? ` for ${user.name}` : '' })}
            </p>
            {/* Integration point: call the real emergency API / notify contacts here. */}
            <p className="mt-2 text-xs text-theme-muted">{t('sos_not_connected')}</p>
            <button
              type="button"
              onClick={() => setSosActive(false)}
              className="mt-4 w-full rounded-xl border border-theme bg-theme-card py-3 text-sm font-semibold text-theme-primary active:scale-[0.98]"
            >
              {t('deactivate_sos')}
            </button>
          </section>
        )}

        <EmergencyContactsSection />

        <ShareTripSection ride={ride} error={error} />

        <Section title={t('ride_safety')} icon="ri-shield-check-line">
          <RideSafetyGuidelines />
        </Section>

        <DriverVerificationSection ride={ride} loading={loading} error={error} />

        <SafetyPreferencesSection />
      </div>

      {/* SOS confirmation */}
      {sosConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-sm rounded-2xl border border-theme bg-theme-card p-4 text-center">
            <i className="ri-alarm-warning-line text-4xl text-brand-yellow" aria-hidden />
            <h3 className="mt-2 text-lg font-bold text-theme-primary">{t('sos_confirm_title')}</h3>
            <p className="mt-1 text-sm text-theme-primary">{t('sos_confirm_body')}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setSosConfirm(false)} className="flex-1 rounded-xl border border-theme bg-theme-card py-3 text-sm font-semibold text-theme-primary active:scale-[0.98]">
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSosConfirm(false)
                  setSosActive(true)
                }}
                className="flex-1 rounded-xl bg-brand-yellow py-3 text-sm font-bold text-black active:scale-[0.98]"
              >
                {t('activate_sos')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Safety
