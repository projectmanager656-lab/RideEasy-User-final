import React, { useCallback, useEffect, useState } from 'react'
import { adminApi } from '../../services/adminApi'
import { useLanguage } from '../../i18n'

const NOTIF_TYPES = ['new_feature', 'promotion', 'important_update', 'system_alert', 'admin']

/** Channel delivery chips: one per in-app/push/sms with sent/failed state. */
function DeliveryChips ({ delivery, t }) {
  const chip = (sent, label, error, enabled) => (
    <span
      key={label}
      title={enabled && error ? error : undefined}
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        !enabled ? 'bg-neutral-100 text-neutral-400'
          : sent ? 'bg-emerald-50 text-emerald-700'
            : 'bg-red-50 text-red-600'
      }`}
    >
      {label}{enabled ? (sent ? ' ✓' : ' ✗') : ''}
    </span>
  )
  return (
    <div className="flex flex-wrap gap-1">
      {chip(true, t('notif_channel_inapp'), null, true)}
      {chip(delivery?.push?.sent === true, t('notif_channel_push'), delivery?.push?.error, true)}
      {chip(delivery?.sms?.sent === true, t('notif_channel_sms'), delivery?.sms?.error, true)}
    </div>
  )
}

export default function NotificationsTab () {
  const { t } = useLanguage()

  const [form, setForm] = useState({
    type: 'new_feature',
    title: '',
    message: '',
    allUsers: true,
    userId: '',
    push: false,
    sms: false,
  })
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sendNote, setSendNote] = useState('')

  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')

  const loadHistory = useCallback(() => {
    setHistoryLoading(true)
    setHistoryError('')
    adminApi.listNotifications()
      .then((data) => setHistory((data?.notifications || [])))
      .catch(() => setHistoryError(t('notif_history_failed')))
      .finally(() => setHistoryLoading(false))
  }, [t])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const send = () => {
    const title = form.title.trim()
    const message = form.message.trim()
    if (!title) { setSendError(t('notif_title_required')); return }
    if (!message) { setSendError(t('notif_message_required')); return }
    if (!form.allUsers && !form.userId.trim()) { setSendError(t('notif_user_id_required')); return }

    setSending(true)
    setSendError('')
    setSendNote('')
    adminApi.sendNotification({
      type: form.type,
      title,
      message,
      allUsers: form.allUsers,
      ...(!form.allUsers ? { userId: form.userId.trim() } : {}),
      channels: { push: form.push, sms: form.sms },
    })
      .then((data) => {
        setSendNote(t('notif_send_ok', { created: data?.created ?? data?.recipients ?? 0, recipients: data?.recipients ?? 0 }))
        setForm({ ...form, title: '', message: '' })
        loadHistory()
      })
      .catch((err) => setSendError(err?.response?.data?.message || t('notif_send_failed')))
      .finally(() => setSending(false))
  }

  const inputClass = 'w-full rounded-xl border border-neutral-300 bg-neutral-50 p-2.5 sm:p-3 text-xs sm:text-sm text-black focus:border-black focus:outline-none focus:ring-1 focus:ring-black'

  return (
    <>
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6 shadow-xl">
        <p className="mb-3 text-xs sm:text-sm text-neutral-600">{t('notif_tab_note')}</p>
        <h3 className="mb-3 text-sm font-bold text-neutral-900">{t('notif_compose_title')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">{t('notif_type_label')}</span>
            <select
              className={inputClass}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {NOTIF_TYPES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">{t('notif_title_label')}</span>
            <input className={inputClass} maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-neutral-600">{t('notif_message_label')}</span>
            <textarea className={`${inputClass} h-24`} maxLength={2000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </label>
          <div className="sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-neutral-600">{t('notif_audience_label')}</span>
            <label className="flex items-center gap-2 text-xs sm:text-sm text-neutral-700">
              <input type="checkbox" checked={form.allUsers} onChange={(e) => setForm({ ...form, allUsers: e.target.checked })} />
              {t('notif_audience_all')}
            </label>
            {!form.allUsers && (
              <input
                className={`${inputClass} mt-2 font-mono`}
                placeholder={t('notif_user_id_placeholder')}
                value={form.userId}
                onChange={(e) => setForm({ ...form, userId: e.target.value })}
              />
            )}
          </div>
          <div className="sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-neutral-600">{t('notif_channels')}</span>
            <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-neutral-700">
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-500">{t('notif_channel_inapp')} ✓</span>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.push} onChange={(e) => setForm({ ...form, push: e.target.checked })} />
                {t('notif_channel_push')}
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.sms} onChange={(e) => setForm({ ...form, sms: e.target.checked })} />
                {t('notif_channel_sms')}
              </label>
            </div>
          </div>
        </div>
        {sendError ? <p className="mt-3 text-xs sm:text-sm font-medium text-red-600">{sendError}</p> : null}
        {sendNote ? <p className="mt-3 text-xs sm:text-sm font-medium text-emerald-600">{sendNote}</p> : null}
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="mt-4 rounded-lg bg-black px-4 py-2.5 sm:px-5 text-xs sm:text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {sending ? t('notif_sending') : t('notif_send')}
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-3 py-3 sm:px-4">
          <h3 className="text-sm font-bold text-neutral-900">{t('notif_history_title')}</h3>
          <button type="button" onClick={loadHistory} className="text-xs font-medium text-neutral-600 hover:text-black">
            <i className="ri-refresh-line mr-1" />{t('refresh')}
          </button>
        </div>
        {historyLoading ? (
          <div className="p-12 text-center text-neutral-600">{t('notif_loading_history')}</div>
        ) : historyError ? (
          <div className="p-12 text-center text-sm text-neutral-900">{historyError}</div>
        ) : history.length === 0 ? (
          <div className="p-12 text-center text-neutral-600">{t('notif_no_history')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] sm:min-w-[760px] text-left text-sm text-neutral-900">
              <thead className="border-b border-neutral-200 bg-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">{t('notif_title_label')}</th>
                  <th className="px-4 py-3">{t('notif_message_label')}</th>
                  <th className="px-4 py-3">{t('notif_type_label')}</th>
                  <th className="px-4 py-3">{t('when_col')}</th>
                  <th className="px-4 py-3">{t('notif_delivery')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {history.map((n) => (
                  <tr key={n._id} className={n.isRead ? '' : 'bg-emerald-50/40'}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {n.title}{n.isRead ? '' : <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{t('notif_unread')}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">{n.message}</td>
                    <td className="px-4 py-3 text-xs uppercase text-neutral-500">{n.type}</td>
                    <td className="px-4 py-3 text-xs text-neutral-600">{new Date(n.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3"><DeliveryChips delivery={n.delivery} t={t} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
