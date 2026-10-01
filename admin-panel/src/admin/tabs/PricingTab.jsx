import React, { useEffect, useState } from 'react'
import { adminApi } from '../../services/adminApi'
import { useLanguage } from '../../i18n'

/** RideEasy Support hotline editor — saves to `rideeasy_support` and pushes a
 * live `rideeasySupportUpdated` socket broadcast to every connected app. */
function SupportConfigCard () {
  const { t } = useLanguage()
  const [form, setForm] = useState({ name: '', phone: '', description: '', isActive: true })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    adminApi.getSupport()
      .then((data) => {
        if (cancelled) return
        if (data?.support) {
          setForm({
            name: data.support.name || '',
            phone: data.support.phone || '',
            description: data.support.description || '',
            isActive: data.support.isActive !== false,
          })
        } else {
          setError(t('support_missing'))
        }
      })
      .catch(() => { if (!cancelled) setError(t('support_load_failed')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [t])

  const save = () => {
    const phone = form.phone.trim()
    if (phone && !/^\+?[\d\s-]{7,15}$/.test(phone)) {
      setError(t('support_phone_invalid'))
      return
    }
    setSaving(true)
    setError('')
    setNote('')
    adminApi.putSupport({
      name: form.name,
      phone,
      description: form.description,
      isActive: form.isActive,
    })
      .then(() => setNote(t('support_saved')))
      .catch((err) => setError(err?.response?.data?.message || t('support_save_failed')))
      .finally(() => setSaving(false))
  }

  if (loading) {
    return (
      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6 shadow-xl">
        <p className="text-xs sm:text-sm text-neutral-600">{t('loading_pricing')}</p>
      </div>
    )
  }

  const inputClass = 'w-full rounded-xl border border-neutral-300 bg-neutral-50 p-2.5 sm:p-3 text-xs sm:text-sm text-black focus:border-black focus:outline-none focus:ring-1 focus:ring-black'

  return (
    <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6 shadow-xl">
      <h3 className="mb-3 text-sm font-bold text-neutral-900">{t('support_config_title')}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">{t('support_name')}</span>
          <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">{t('support_phone')}</span>
          <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+919876543210" />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-neutral-600">{t('support_description')}</span>
          <input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs sm:text-sm text-neutral-700">
        <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
        {t('support_active')}
      </label>
      {error ? <p className="mt-3 text-xs sm:text-sm font-medium text-red-600">{error}</p> : null}
      {note ? <p className="mt-3 text-xs sm:text-sm font-medium text-emerald-600">{note}</p> : null}
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-4 rounded-lg bg-black px-4 py-2.5 sm:px-5 text-xs sm:text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {t('save_support')}
      </button>
    </div>
  )
}

export default function PricingTab ({ pricingJson, setPricingJson, savePricing, pricingLoading }) {
  const { t } = useLanguage()

  if (pricingLoading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center text-neutral-600 shadow-xl">
        {t('loading_pricing')}
      </div>
    )
  }

  return (
    <>
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6 shadow-xl">
        <p className="mb-3 text-xs sm:text-sm text-neutral-600">
          {t('pricing_tab_note')}
        </p>
        <textarea
          className="h-64 sm:h-72 w-full rounded-xl border border-neutral-300 bg-neutral-50 p-3 sm:p-4 font-mono text-xs sm:text-sm text-black focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          value={pricingJson}
          onChange={(e) => setPricingJson(e.target.value)}
          placeholder={t('pricing_json_placeholder')}
        />
        <button
          type="button"
          onClick={savePricing}
          className="mt-4 rounded-lg bg-black px-4 py-2.5 sm:px-5 text-xs sm:text-sm font-semibold text-white hover:bg-neutral-800"
        >
          {t('save_pricing')}
        </button>
      </div>
      <SupportConfigCard />
    </>
  )
}
