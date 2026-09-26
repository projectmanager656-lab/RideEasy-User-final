import React, { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
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
  // account-details inline edit (personal info)
  const [ editingName, setEditingName ] = useState(false)
  const [ name, setName ] = useState('')
  const [ gender, setGender ] = useState('')
  const [ dateOfBirth, setDateOfBirth ] = useState('')
  // change password
  const [ currentPassword, setCurrentPassword ] = useState('')
  const [ newPassword, setNewPassword ] = useState('')
  const [ confirmPassword, setConfirmPassword ] = useState('')
  const [ pwError, setPwError ] = useState('')
  const [ pwMessage, setPwMessage ] = useState('')
  const [ pwSaving, setPwSaving ] = useState(false)
  const [ saving, setSaving ] = useState(false)
  const [ uploadingPhoto, setUploadingPhoto ] = useState(false)
  const photoInputRef = useRef(null)
  const isNative = Capacitor.isNativePlatform()
  const [ message, setMessage ] = useState('')
  const [ error, setError ] = useState('')
  const [ rideCount, setRideCount ] = useState(0)
  const [ rating, setRating ] = useState(0)

  useEffect(() => {
    setName(user?.name || '')
    setGender(user?.gender || '')
    setDateOfBirth(user?.dateOfBirth || '')
    setHome(user?.savedAddresses?.home || '')
    setWork(user?.savedAddresses?.work || '')
  }, [ user?._id, user?.name, user?.gender, user?.dateOfBirth, user?.savedAddresses?.home, user?.savedAddresses?.work ])

  const loadRideSummary = useCallback(async () => {
    try {
      const res = await apiClient.get('/rides/history', withAuth({ params: { limit: 'all' } }))
      const raw = stripApiEnvelope(res.data)
      const list = Array.isArray(raw?.rides) ? raw.rides : Array.isArray(raw) ? raw : []
      const completed = list.filter((r) => String(r?.status).toLowerCase() === 'completed')
      /** Real total from the backend (covers all rides), not just the fetched page. */
      setRideCount(Number(raw?.counts?.total) || list.length)
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

  // Save account details (name, gender, date of birth).
  const saveAccountDetails = async (e) => {
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
        gender,
        dateOfBirth,
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

  // Upload a chosen/captured image and refresh the signed-in user.
  const uploadProfilePhotoBlob = async (blob, format) => {
    setUploadingPhoto(true)
    setError('')
    setMessage('')
    try {
      const formData = new FormData()
      formData.append('profilePhoto', blob, `profile-${Date.now()}.${format || 'jpg'}`)

      // No manual Content-Type — axios lets the browser set the multipart boundary.
      const { data } = await apiClient.post('/users/profile/photo', formData, withAuth())
      const body = stripApiEnvelope(data)
      const u = body?.user || body
      if (u && typeof u === 'object') setUser(u)
      setMessage(t('saved'))
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setUploadingPhoto(false)
    }
  }

  // Change the profile photo via Camera/Gallery, then upload it to the backend.
  const pickProfilePhoto = async (source = CameraSource.Prompt) => {
    if (uploadingPhoto) return

    // Web/PWA has no native camera plugin — fall back to the browser file picker.
    if (!isNative) {
      const input = photoInputRef.current
      if (!input) return
      input.value = ''
      input.capture = source === CameraSource.Camera ? 'environment' : ''
      input.click()
      return
    }

    let photo
    try {
      photo = await Camera.getPhoto({
        quality: 80,
        width: 512,
        height: 512,
        resultType: CameraResultType.Uri,
        source,
      })
    } catch {
      // Camera/Gallery cancelled or unavailable — don't surface an error.
      return
    }

    const blob = await (await fetch(photo.webPath)).blob()
    await uploadProfilePhotoBlob(blob, photo.format)
  }

  const onPhotoInputChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = String(file.name.split('.').pop() || 'jpg').toLowerCase()
    await uploadProfilePhotoBlob(file, ext === 'jpeg' ? 'jpg' : ext)
  }

  // Reset the account-details fields back to the saved user.
  const cancelAccountEdit = () => {
    setName(user?.name || '')
    setGender(user?.gender || '')
    setDateOfBirth(user?.dateOfBirth || '')
    setEditingName(false)
    setError('')
  }

  const toggleAccountEdit = () => {
    if (editingName) {
      cancelAccountEdit()
      return
    }
    setName(user?.name || '')
    setGender(user?.gender || '')
    setDateOfBirth(user?.dateOfBirth || '')
    setEditingName(true)
    setError('')
    setMessage('')
  }

  // Render a stored YYYY-MM-DD birth date as "D MMM YYYY".
  const formatDob = (value) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
    if (!m) return ''
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    return `${Number(m[3])} ${t(months[Number(m[2]) - 1])} ${m[1]}`
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
      <div className="min-h-screen scrollbar-hide bg-theme-bg text-theme-primary pb-24">
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPhotoInputChange}
        />
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

          {/* profile photo */}
          <section className="rounded-2xl border border-theme bg-theme-card p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-theme-secondary">{t('profile_photo')}</h2>
            <div className="mt-4 flex items-center gap-4">
              <div className="relative h-20 w-20 shrink-0">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-theme-card-muted text-theme-muted">
                  {user?.profilePhoto ? (
                    <img src={user.profilePhoto} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <i className="ri-user-3-fill text-4xl" />
                  )}
                </div>
                {uploadingPhoto ? (
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white">
                    <i className="ri-loader-4-line animate-spin text-xl" />
                  </span>
                ) : null}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <button
                  type="button"
                  onClick={() => pickProfilePhoto(CameraSource.Photos)}
                  disabled={uploadingPhoto}
                  className="flex items-center justify-center gap-2 rounded-xl border border-theme bg-theme-card-muted py-2.5 text-sm font-semibold text-theme-secondary transition hover:text-theme-primary disabled:opacity-60"
                >
                  <i className="ri-image-line text-base" />
                  {t('choose_photo')}
                </button>
                <button
                  type="button"
                  onClick={() => pickProfilePhoto(CameraSource.Camera)}
                  disabled={uploadingPhoto}
                  className="flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-bold text-brand-ink transition hover:bg-brand-light disabled:opacity-60"
                >
                  <i className="ri-camera-line text-base" />
                  {t('take_photo')}
                </button>
              </div>
            </div>
          </section>

          {/* account details */}
          <section className="rounded-2xl border border-theme bg-theme-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-theme-secondary">{t('account_details')}</h2>
              <button
                type="button"
                onClick={toggleAccountEdit}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-theme bg-theme-card-muted px-3 py-1.5 text-xs font-semibold text-theme-secondary transition hover:text-theme-primary"
              >
                <i className="ri-edit-line text-sm" />
                {t('edit')}
              </button>
            </div>

            {editingName ? (
              <form onSubmit={saveAccountDetails} className="mt-4 space-y-4">
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
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-theme-secondary">{t('gender')}</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full rounded-xl border border-theme bg-theme-input px-4 py-3 text-base text-theme-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/60"
                  >
                    <option value="">{t('select_gender')}</option>
                    <option value="male">{t('male')}</option>
                    <option value="female">{t('female')}</option>
                    <option value="other">{t('other')}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-theme-secondary">{t('date_of_birth')}</label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    className="w-full rounded-xl border border-theme bg-theme-input px-4 py-3 text-base text-theme-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/60"
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
                    onClick={cancelAccountEdit}
                    className="rounded-xl border border-theme bg-theme-card px-4 py-3 text-sm font-semibold text-theme-secondary hover:bg-theme-card-muted"
                  >
                    {t('close')}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-2 divide-y divide-theme">
                <InfoRow icon="ri-user-3-line" label={t('full_name')} value={user?.name} />
                <InfoRow icon="ri-venus-mars-line" label={t('gender')} value={user?.gender ? t(user.gender) : null} />
                <InfoRow icon="ri-calendar-line" label={t('date_of_birth')} value={formatDob(user?.dateOfBirth)} />
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
    <div className="min-h-screen scrollbar-hide bg-theme-bg text-theme-primary pb-24">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPhotoInputChange}
      />
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
              <button
                type="button"
                onClick={() => pickProfilePhoto()}
                disabled={uploadingPhoto}
                aria-label={t('edit')}
                className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-theme-card-muted text-theme-muted disabled:opacity-60"
              >
                {user?.profilePhoto ? (
                  <img src={user.profilePhoto} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <i className="ri-user-3-fill text-3xl" />
                )}
                {uploadingPhoto ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                    <i className="ri-loader-4-line animate-spin text-xl" />
                  </span>
                ) : null}
              </button>
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
            icon="ri-wallet-3-line"
            title="Wallet"
            subtitle="View your wallet balance and transactions"
            accent="purple"
            onClick={() => navigate('/wallet')}
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
          className="w-full rounded-2xl border border-red-500/30 bg-red-500/10 py-3 text-sm font-semibold text-red-500 hover:bg-red-500/15"
        >
          {t('log_out')}
        </button>
      </div>
    </div>
  )
}

export default UserProfile
