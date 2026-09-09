import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, withAuth } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { stripApiEnvelope } from '../utils/apiBody'
import { useLanguage } from '../i18n'
import { inputBase, errorBoxClass } from '../components/auth/classes'
import PhoneInput from '../components/auth/PhoneInput'

const EmergencyContact = () => {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [ loading, setLoading ] = useState(true)
  const [ error, setError ] = useState('')
  const [ message, setMessage ] = useState('')
  const [ contact, setContact ] = useState(null) // { name, phone, relationship }
  const [ editing, setEditing ] = useState(false)
  const [ name, setName ] = useState('')
  const [ phone, setPhone ] = useState('')
  const [ relationship, setRelationship ] = useState('')
  const [ saving, setSaving ] = useState(false)

  // Relationship options
  const relationshipOptions = [
    { value: 'family', label: t('family') },
    { value: 'friend', label: t('friend') },
    { value: 'parent', label: t('parent') },
    { value: 'spouse', label: t('spouse') },
    { value: 'other', label: t('other') },
  ]

  useEffect(() => {
    loadEmergencyContact()
  }, [])

  const loadEmergencyContact = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiClient.get('/users/emergency-contact', withAuth())
      const raw = stripApiEnvelope(res.data)
      const emergencyContact = raw?.emergencyContact ?? null
      setContact(emergencyContact)
      
      if (emergencyContact) {
        setName(emergencyContact.name || '')
        setPhone(emergencyContact.phone || '')
        setRelationship(emergencyContact.relationship || '')
      }
    } catch (err) {
      // If no emergency contact exists yet, that's okay
      if (err.response?.status === 404) {
        setContact(null)
        setName('')
        setPhone('')
        setRelationship('')
      } else {
        setError(formatApiError(err))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const saveEmergencyContact = useCallback(async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    
    // Validation
    if (!name.trim()) {
      setError(t('valid_name_error')) // Reusing existing validation message
      setSaving(false)
      return
    }
    
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError(t('valid_phone_error')) // Reusing existing validation message
      setSaving(false)
      return
    }
    
    if (!relationship) {
      setError(t('valid_phone_error')) // Reusing for now - should add specific validation
      setSaving(false)
      return
    }
    
    try {
      const { data } = await apiClient.post(
        '/users/emergency-contact',
        { name: name.trim(), phone, relationship },
        withAuth()
      )
      const raw = stripApiEnvelope(data)
      const savedContact = raw?.emergencyContact ?? raw
      setContact(savedContact)
      setEditing(false)
      setMessage(t('saved')) // Reusing existing message
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setSaving(false)
    }
  }, [name, phone, relationship])

  const deleteEmergencyContact = useCallback(async () => {
    if (!window.confirm(t('delete_contact'))) {
      return
    }
    
    setSaving(true)
    setError('')
    setMessage('')
    
    try {
      await apiClient.delete('/users/emergency-contact', withAuth())
      setContact(null)
      setName('')
      setPhone('')
      setRelationship('')
      setEditing(false)
      setMessage(t('saved')) // Reusing for now
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setSaving(false)
    }
  }, [])

  const handleEditClick = () => {
    setEditing(true)
  }

  return (
    <div className="min-h-screen bg-theme-bg text-theme-primary pb-24">
      {/* header */}
      <header className="sticky top-0 z-10 border-b border-theme bg-theme-bg/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-theme bg-theme-card text-theme-secondary hover:bg-theme-card-muted"
            aria-label={t('back')}
          >
            <i className="ri-arrow-left-line text-lg" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-theme-primary">{t('emergency_contact')}</h1>
            <p className="mt-1 text-sm text-theme-muted">{t('keep_someone_informed')}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-5 px-4 pt-4">
        {/* emergency contact info card */}
        <section className="rounded-2xl border border-theme bg-theme-card p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-theme-muted">
              <i className="ri-loader-4-line animate-spin text-2xl text-brand" aria-hidden />
            </div>
          ) : contact ? (
            <>
              <div className="flex items-start gap-3">
                <div className="relative">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-theme-card-muted text-theme-muted">
                    <i className="ri-phone-line text-3xl" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h2 className="truncate text-lg font-bold text-theme-primary">{contact.name}</h2>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-theme-secondary">
                    <span>{contact.phone}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-theme-secondary">
                    <span>
                      {relationshipOptions.find(opt => opt.value === contact.relationship)?.label}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleEditClick}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-theme bg-theme-card-muted px-3 py-1.5 text-xs font-semibold text-theme-secondary transition hover:text-theme-primary"
                  >
                    <i className="ri-edit-line text-sm" />
                    {t('edit')}
                  </button>
                  <button
                    type="button"
                    onClick={deleteEmergencyContact}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-theme bg-theme-card-muted px-3 py-1.5 text-xs font-semibold text-theme-secondary transition hover:text-theme-primary"
                  >
                    <i className="ri-delete-bin-line text-sm" />
                    {t('delete')}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/15 text-rose-500">
                <i className="ri-phone-line text-2xl" />
              </div>
              <p className="mb-5 mt-3 max-w-[260px] text-sm text-theme-muted">
                {t('keep_someone_informed')}
              </p>
              <button
                type="button"
                onClick={handleEditClick}
                className="flex items-center gap-2 rounded-full bg-rose-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-rose-600"
              >
                <i className="ri-add-line text-base" aria-hidden />
                {t('add_emergency_contact')}
              </button>
            </div>
          )}
        </section>

        {/* edit form */}
        {editing && (
          <form onSubmit={saveEmergencyContact} className="space-y-4 rounded-2xl border border-theme bg-theme-card p-4">
            {error ? (
              <div role="alert" className={errorBoxClass}>
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="rounded-xl border border-emerald-500/50 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                {message}
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-theme-secondary">{t('contact_name')}</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`${inputBase} w-full`}
                placeholder={t('contact_name')}
                required
              />
            </div>
            {/* PhoneInput renders its own label — no outer label needed. */}
            <PhoneInput
              value={phone}
              onChange={setPhone}
              label={t('phone_number')}
              placeholder={t('mobile_10_digit')}
              required
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-theme-secondary">{t('relationship')}</label>
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className={`${inputBase} w-full`}
                required
              >
                <option value="">{t('select_relationship')} </option>
                {relationshipOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-brand-ink hover:bg-brand-light disabled:opacity-60"
              >
                {saving ? t('saving') : t('save_contact')}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-xl border border-theme bg-theme-card px-4 py-3 text-sm font-semibold text-theme-secondary hover:bg-theme-card-muted"
              >
                {t('close')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default EmergencyContact