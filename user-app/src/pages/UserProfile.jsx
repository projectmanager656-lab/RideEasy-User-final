import React, { useCallback, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserDataContext } from '../context/UserContext'
import { apiClient, withAuth } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { stripApiEnvelope } from '../utils/apiBody'
import { useLanguage } from '../i18n'
import ThemeSelector from '../components/ThemeSelector'
import LanguageSelector from '../components/LanguageSelector'
import PasswordInput from '../components/auth/PasswordInput'

const ProfileStatCard = ({ icon, value, label, accent }) => {
  const accents = {
    yellow: { circle: 'bg-brand/15 text-brand', glow: 'bg-brand' },
    blue: { circle: 'bg-sky-500/15 text-sky-500', glow: 'bg-sky-500' },
    purple: { circle: 'bg-violet-500/15 text-violet-500', glow: 'bg-violet-500' },
  }
  const a = accents[accent] || accents.yellow
  return (
    <div className="relative flex flex-col items-center gap-1.5 overflow-hidden rounded-2xl border border-theme bg-theme-card px-2 py-3">
      <span className={`flex h-9 w-9 items-center justify-center rounded-full ${a.circle}`}>
        <i className={`${icon} text-base`} />
      </span>
      <span className="text-xl font-bold text-theme-primary">{value}</span>
      <span className="text-center text-[0.7rem] leading-tight text-theme-muted">{label}</span>
      <span className={`absolute inset-x-0 bottom-0 h-0.5 ${a.glow}`} />
    </div>
  )
}

const AccountMenuItem = ({ icon, title, subtitle, accent, chevron = true, children, onClick }) => {
  const accents = {
    yellow: 'bg-brand/15 text-brand',
    blue: 'bg-sky-500/15 text-sky-500',
    green: 'bg-emerald-500/15 text-emerald-500',
    purple: 'bg-violet-500/15 text-violet-500',
    cyan: 'bg-cyan-500/15 text-cyan-500',
    red: 'bg-rose-500/15 text-rose-500',
  }
  const a = accents[accent] || accents.yellow
  const inner = (
    <>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${a}`}>
        <i className={`${icon} text-lg`} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-theme-primary">{title}</p>
        <p className="mt-0.5 text-xs text-theme-muted">{subtitle}</p>
      </div>
      {children}
      {chevron ? <i className="ri-arrow-right-s-line shrink-0 text-theme-muted" /> : null}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-2xl border border-theme bg-theme-card p-3 text-left transition hover:bg-theme-card-muted"
      >
        {inner}
      </button>
    )
  }

  return (
    <div className="flex w-full items-center gap-3 rounded-2xl border border-theme bg-theme-card p-3">
      {inner}
    </div>
  )
}

/** One read-only row inside the Personal Information details. */
const InfoRow = ({ icon, label, value, last = false }) => (
  <div className={`flex items-center gap-3 py-3 ${last ? '' : 'border-b border-theme'}`}>
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
      <i className={`${icon} text-lg`} aria-hidden />
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-xs font-medium text-theme-muted">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-theme-primary">{value || '—'}</p>
    </div>
  </div>
)

const UserProfile = () => {
  const { t } = useLanguage()
  const { user, setUser, refreshUser } = useContext(UserDataContext)
  const navigate = useNavigate()
  const [ view, setView ] = useState('overview') // overview | personal
  // saved-places inline edit
  const [ editingPlaces, setEditingPlaces ] = useState(false)
  const [ home, setHome ] = useState('')
  const [ work, setWork ] = useState('')
  // name inline edit (personal info)
  const [ editingName, setEditingName ] = useState(false)
  const [ name, setName ] = useState('')
  // change password
  const [ currentPassword, setCurrentPassword ] = useState('')
  const [ newPassword, setNewPassword ] = useState('')
  const [ confirmPassword, setConfirmPassword ] = useState('')
  const [ pwError, setPwError ] = useState('')
  const [ pwMessage, setPwMessage ] = useState('')
  const [ pwSaving, setPwSaving ] = useState(false)
  const [ saving, setSaving ] = useState(false)
  const [ message, setMessage ] = useState('')
  const [ error, setError ] = useState('')
  const [ rideCount, setRideCount ] = useState(0)
  const [ rating, setRating ] = useState(0)

  useEffect(() => {
    setName(user?.name || '')
    setHome(user?.savedAddresses?.home || '')
    setWork(user?.savedAddresses?.work || '')
  }, [ user?._id, user?.name, user?.savedAddresses?.home, user?.savedAddresses?.work ])

  const loadRideSummary = useCallback(async () => {
    try {
      const res = await apiClient.get('/rides/history', withAuth({ params: { limit: 100 } }))
      const raw = stripApiEnvelope(res.data)
      const list = Array.isArray(raw?.rides) ? raw.rides : Array.isArray(raw) ? raw : []
      const completed = list.filter((r) => String(r?.status).toLowerCase() === 'completed')
      setRideCount(list.length)
      if (completed.length) {
        const sum = completed.reduce((acc, r) => acc + (Number(r?.rating) || 0), 0)
        setRating(Math.round((sum / completed.length) * 10) / 10)
      }
    } catch {
      /* non-fatal — stats fall back to 0 */
    }
  }, [])

  useEffect(() => {
    loadRideSummary()
  }, [ loadRideSummary ])

  // Save home/work (Saved Places) — kept for ride-booking quick picks on Home.
  const savePlaces = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const { data } = await apiClient.patch('/users/profile', {
        savedAddresses: { home: home.trim(), work: work.trim() },
      }, withAuth())
      const body = stripApiEnvelope(data)
      const u = body?.user ?? body
      if (u && typeof u === 'object') setUser(u)
      setMessage(t('saved'))
      setEditingPlaces(false)
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setSaving(false)
    }
  }

  // Save display name (Personal Information).
  const saveName = async (e) => {
    e.preventDefault()
    if (String(name || '').trim().length < 2) {
      setError(t('valid_name_error'))
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const { data } = await apiClient.patch('/users/profile', {
        name: String(name).trim(),
      }, withAuth())
      const body = stripApiEnvelope(data)
      const u = body?.user ?? body
      if (u && typeof u === 'object') setUser(u)
      setMessage(t('saved'))
      setEditingName(false)
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async (e) => {
    e.preventDefault()
    setPwError('')
    setPwMessage('')

    // Frontend validation (mirrors backend rules).
    if (!String(currentPassword || '').trim()) {
      setPwError(t('current_password_required'))
      return
    }
    if (!String(newPassword || '')) {
      setPwError(t('new_password_required'))
      return
    }
    if (String(newPassword).length < 6) {
      setPwError(t('password_min_length'))
      return
    }
    if (String(confirmPassword) !== String(newPassword)) {
      setPwError(t('passwords_do_not_match'))
      return
    }

    setPwSaving(true)
    try {
      await apiClient.post('/users/change-password', {
        currentPassword,
        newPassword,
      }, withAuth())
      // Clear fields + show success. No forced redirect — stays on the page.
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPwMessage(t('password_changed_success'))
    } catch (err) {
      setPwError(formatApiError(err))
    } finally {
      setPwSaving(false)
    }
  }

  const logout = () => {
    navigate('/user/logout', { replace: true })
  }

  const wallet = Number(user?.walletBalance || 0)
  const walletLabel = wallet > 0 ? `₹${wallet.toLocaleString('en-IN')}` : '—'

  const openPersonal = () => {
    setEditingName(false)
    setError('')
    setMessage('')
    setPwError('')
    setPwMessage('')
    setView('personal')
  }

  const openSavedPlaces = () => {
    setView('overview')
    setEditingPlaces(true)
    setError('')
    setMessage('')
  }

  // ---- Personal Information detail view (details + change password) ----
  if (view === 'personal') {
    const username = user?.username
    return (
      <div className="min-h-screen bg-theme-bg text-theme-primary pb-24">
        {/* header */}
        <header className="sticky top-0 z-10 border-b border-theme bg-theme-bg/90 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <button
              type="button"
              onClick={() => setView('overview')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-theme bg-theme-card text-theme-secondary hover:bg-theme-card-muted"
              aria-label={t('back')}
            >
              <i className="ri-arrow-left-line text-lg" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-theme-primary">{t('personal_information')}</h1>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-lg space-y-5 px-4 pt-4">
          {/* messages */}
          {error ? (
            <div role="alert" className="rounded-xl border border-red-400/50 bg-red-50 px-3 py-2 text-sm text-red-700 whitespace-pre-line dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="rounded-xl border border-emerald-500/50 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200">
              {message}
            </div>
          ) : null}

          {/* account details */}
          <section className="rounded-2xl border border-theme bg-theme-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-theme-secondary">{t('account_details')}</h2>
              <button
                type="button"
                onClick={() => { setEditingName((v) => !v); setError(''); setMessage('') }}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-theme bg-theme-card-muted px-3 py-1.5 text-xs font-semibold text-theme-secondary transition hover:text-theme-primary"
              >
                <i className="ri-edit-line text-sm" />
                {t('edit')}
              </button>
            </div>

            {editingName ? (
              <form onSubmit={saveName} className="mt-4 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-theme-secondary">{t('full_name')}</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-theme bg-theme-input px-4 py-3 text-base text-theme-primary placeholder:text-theme-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/60"
                    placeholder={t('your_name')}
                    minLength={2}
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-brand-ink hover:bg-brand-light disabled:opacity-60"
                  >
                    {saving ? t('saving') : t('save_changes')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingName(false)}
                    className="rounded-xl border border-theme bg-theme-card px-4 py-3 text-sm font-semibold text-theme-secondary hover:bg-theme-card-muted"
                  >
                    {t('close')}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-2 divide-y divide-theme">
                <InfoRow icon="ri-user-3-line" label={t('full_name')} value={user?.name} />
                <InfoRow icon="ri-phone-line" label={t('phone_number')} value={user?.phone ? `+91 ${user.phone}` : null} />
                <InfoRow icon="ri-mail-line" label={t('email')} value={user?.email} />
                {username ? (
                  <InfoRow icon="ri-user-smile-line" label={t('username')} value={username} last />
                ) : null}
              </div>
            )}
          </section>

          {/* change password */}
          <section className="rounded-2xl border border-theme bg-theme-card p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-theme-secondary">{t('change_password')}</h2>
            <form onSubmit={changePassword} className="mt-4 space-y-4">
              {pwError ? (
                <div role="alert" className="rounded-xl border border-red-400/50 bg-red-50 px-3 py-2 text-sm text-red-700 whitespace-pre-line dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                  {pwError}
                </div>
              ) : null}
              {pwMessage ? (
                <div className="rounded-xl border border-emerald-500/50 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                  {pwMessage}
                </div>
              ) : null}

              <PasswordInput
                value={currentPassword}
                onChange={setCurrentPassword}
                label={t('current_password')}
                placeholder={t('current_password')}
                autoComplete="current-password"
                name="current-password"
              />
              <PasswordInput
                value={newPassword}
                onChange={setNewPassword}
                label={t('new_password')}
                placeholder={t('new_password')}
                autoComplete="new-password"
                name="new-password"
              />
              <PasswordInput
                value={confirmPassword}
                onChange={setConfirmPassword}
                label={t('confirm_new_password')}
                placeholder={t('confirm_new_password')}
                autoComplete="new-password"
                name="confirm-new-password"
              />

              <button
                type="submit"
                disabled={pwSaving}
                className="w-full rounded-xl bg-brand py-3 text-sm font-bold text-brand-ink transition hover:bg-brand-light disabled:opacity-60"
              >
                {pwSaving ? t('changing_password') : t('change_password')}
              </button>
            </form>
          </section>
        </div>
      </div>
    )
  }

  // ---- Overview (account menu) ----
  return (
    <div className="min-h-screen bg-theme-bg text-theme-primary pb-24">
      {/* header */}
      <header className="sticky top-0 z-10 border-b border-theme bg-theme-bg/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xl font-black tracking-tight">
              <span className="text-theme-primary">Ride</span>
              <span className="text-brand">Easy</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshUser()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-theme bg-theme-card text-theme-secondary hover:bg-theme-card-muted"
            aria-label={t('refresh_profile')}
          >
            <i className="ri-refresh-line text-lg" />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-5 px-4 pt-4">
        {/* profile card */}
        <section className="rounded-2xl border border-theme bg-theme-card p-4">
          <div className="flex items-start gap-3">
            <div className="relative">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-theme-card-muted text-theme-muted">
                <i className="ri-user-3-fill text-3xl" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-theme-card bg-emerald-500" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-lg font-bold text-theme-primary">{user?.name || t('your_name')}</h2>
                <i className="ri-verified-badge-fill text-sky-500" title={t('verified')} />
              </div>
              <span className="mt-1 inline-flex items-center rounded-full bg-brand/15 px-2.5 py-0.5 text-xs font-bold text-brand">
                {t('premium_user')}
              </span>
              <div className="mt-2 flex items-center gap-2 text-sm text-theme-secondary">
                <i className="ri-star-fill text-brand" />
                <span className="font-semibold text-theme-primary">{rating || '—'}</span>
                <span className="text-theme-muted">({rideCount} {t('rides')})</span>
              </div>
            </div>
            <button
              type="button"
              onClick={openPersonal}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-theme bg-theme-card-muted px-3 py-1.5 text-xs font-semibold text-theme-secondary transition hover:text-theme-primary"
            >
              <i className="ri-edit-line text-sm" />
              {t('edit')}
            </button>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center gap-2 text-theme-secondary">
              <i className="ri-mail-line text-brand" />
              <span className="truncate">{user?.email || '—'}</span>
            </div>
            <div className="flex items-center gap-2 text-theme-secondary">
              <i className="ri-phone-line text-brand" />
              <span>{user?.phone ? `+91 ${user.phone}` : '—'}</span>
            </div>
          </div>
        </section>

        {/* statistics */}
        <section className="grid grid-cols-3 gap-3">
          <ProfileStatCard icon="ri-car-line" value={rideCount} label={t('total_rides')} accent="yellow" />
          <ProfileStatCard icon="ri-star-line" value={rating || '—'} label={t('rating')} accent="blue" />
          <ProfileStatCard icon="ri-wallet-3-line" value={walletLabel} label={t('wallet_balance')} accent="purple" />
        </section>

        {/* saved places inline edit */}
        {editingPlaces ? (
          <form onSubmit={savePlaces} className="space-y-4 rounded-2xl border border-theme bg-theme-card p-4">
            {error ? (
              <div role="alert" className="rounded-xl border border-red-400/50 bg-red-50 px-3 py-2 text-sm text-red-700 whitespace-pre-line dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="rounded-xl border border-emerald-500/50 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                {message}
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-theme-secondary">{t('home_address')}</label>
              <input
                value={home}
                onChange={(e) => setHome(e.target.value)}
                className="w-full rounded-xl border border-theme bg-theme-input px-4 py-3 text-base text-theme-primary placeholder:text-theme-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/60"
                placeholder={t('quick_pick_map')}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-theme-secondary">{t('work_address')}</label>
              <input
                value={work}
                onChange={(e) => setWork(e.target.value)}
                className="w-full rounded-xl border border-theme bg-theme-input px-4 py-3 text-base text-theme-primary placeholder:text-theme-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/60"
                placeholder={t('quick_pick_map')}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-brand-ink hover:bg-brand-light disabled:opacity-60"
              >
                {saving ? t('saving') : t('save_changes')}
              </button>
              <button
                type="button"
                onClick={() => setEditingPlaces(false)}
                className="rounded-xl border border-theme bg-theme-card px-4 py-3 text-sm font-semibold text-theme-secondary hover:bg-theme-card-muted"
              >
                {t('close')}
              </button>
            </div>
          </form>
        ) : null}

        {/* menu items */}
        <section className="space-y-3">
          <AccountMenuItem
            icon="ri-user-3-line"
            title={t('personal_information')}
            subtitle={t('personal_information_sub')}
            accent="yellow"
            onClick={openPersonal}
          />
          <AccountMenuItem
            icon="ri-map-pin-2-line"
            title={t('saved_places')}
            subtitle={t('saved_places_sub')}
            accent="green"
            onClick={openSavedPlaces}
          />
          <AccountMenuItem
            icon="ri-phone-line"
            title={t('emergency_contact')}
            subtitle={t('emergency_contact_sub')}
            accent="red"
            onClick={() => navigate('/emergency-contact')}
          />
          <AccountMenuItem
            icon="ri-history-line"
            title={t('ride_history')}
            subtitle={t('ride_history_sub')}
            accent="purple"
            onClick={() => navigate('/history')}
          />
          <AccountMenuItem
            icon="ri-palette-line"
            title={t('appearance')}
            subtitle={t('theme')}
            accent="cyan"
            chevron={false}
          >
            <ThemeSelector variant="segmented" className="w-[168px] shrink-0" />
          </AccountMenuItem>
          <AccountMenuItem
            icon="ri-global-line"
            title={t('language')}
            subtitle={t('select_language')}
            accent="blue"
            chevron={false}
          >
            <LanguageSelector className="shrink-0" />
          </AccountMenuItem>
        </section>

        <button
          type="button"
          onClick={logout}
          className="w-full rounded-2xl border border-theme bg-theme-card py-3 text-sm font-semibold text-theme-secondary hover:bg-theme-card-muted"
        >
          {t('log_out')}
        </button>
      </div>
    </div>
  )
}

export default UserProfile
