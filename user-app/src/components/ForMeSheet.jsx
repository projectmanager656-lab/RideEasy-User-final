import React, { useState } from 'react'
import { useLanguage } from '../i18n'

const ForMeSheet = ({ open, users = [], active = '', onSelect, onClose, onAdd }) => {
    const { t } = useLanguage()
    const [ adding, setAdding ] = useState(false)
    const [ name, setName ] = useState('')
    const [ phone, setPhone ] = useState('')

    if (!open) return null

    const reset = () => {
        setAdding(false)
        setName('')
        setPhone('')
    }

    const close = () => {
        reset()
        onClose()
    }

    const add = () => {
        const n = name.trim()
        if (!n) return
        onAdd({ name: n, phone: phone.trim() })
        reset()
    }

    return (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px]" onClick={close} aria-hidden />
            <div className="relative flex max-h-[88dvh] w-full max-w-[340px] flex-col overflow-y-auto rounded-t-2xl border-t border-theme bg-theme-card p-4 pb-5 sm:rounded-2xl sm:border">
                <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-theme-card-muted sm:hidden" />
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-base font-bold text-theme-primary">{t('switch_rider')}</h2>
                    <button
                        type="button"
                        onClick={close}
                        className="rounded-full border border-theme bg-theme-card px-2.5 py-1 text-xs text-theme-secondary active:scale-95"
                    >
                        {t('close')}
                    </button>
                </div>

                <div className="space-y-2">
                    {users.map((u) => (
                        <button
                            key={u.name}
                            type="button"
                            onClick={() => onSelect(u.name)}
                            className="flex w-full items-center gap-3 rounded-xl border border-theme bg-theme-card px-3.5 py-3 text-left transition active:scale-[0.99]"
                        >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
                                <i className="ri-user-3-line text-lg" aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-theme-primary">{u.name}</span>
                                {u.phone && (
                                    <span className="block truncate text-xs text-theme-secondary">{u.phone}</span>
                                )}
                            </span>
                            {u.name === active && <i className="ri-check-line text-brand-yellow" aria-hidden />}
                        </button>
                    ))}

                    {/* For group */}
                    <button
                        type="button"
                        onClick={() => onSelect('For group')}
                        className="flex w-full items-center gap-3 rounded-xl border border-theme bg-theme-card px-3.5 py-3 text-left transition active:scale-[0.99]"
                    >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
                            <i className="ri-group-line text-lg" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1 text-sm font-medium text-theme-primary">{t('for_group')}</span>
                        {active === 'For group' && <i className="ri-check-line text-brand-yellow" aria-hidden />}
                    </button>

                    {adding ? (
                        <div className="rounded-xl border border-theme bg-theme-card p-3">
                            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-theme-secondary">
                                {t('name')}
                            </label>
                            <input
                                autoFocus
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('contact_name')}
                                className="mb-3 w-full rounded-lg border border-theme bg-theme-input px-3 py-2 text-sm text-theme-primary placeholder:text-theme-muted outline-none focus:border-brand-yellow"
                            />
                            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-theme-secondary">
                                {t('phone_number')}
                            </label>
                            <input
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') add()
                                }}
                                placeholder="+91 XXXXX XXXXX"
                                inputMode="tel"
                                className="w-full rounded-lg border border-theme bg-theme-input px-3 py-2 text-sm text-theme-primary placeholder:text-theme-muted outline-none focus:border-brand-yellow"
                            />
                            <div className="mt-3 flex gap-2">
                                <button
                                    type="button"
                                    onClick={reset}
                                    className="flex-1 rounded-lg border border-theme bg-theme-card py-2 text-sm font-medium text-theme-primary active:scale-[0.98]"
                                >
                                    {t('cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={add}
                                    className="flex-1 rounded-lg bg-brand-yellow py-2 text-sm font-bold text-black active:scale-[0.98]"
                                >
                                    {t('add')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setAdding(true)}
                            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-theme bg-theme-card px-3.5 py-3 text-left transition active:scale-[0.99]"
                        >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-yellow/10 text-brand-yellow">
                                <i className="ri-add-line text-lg" aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1 text-sm font-medium text-theme-primary">{t('add_new_contact')}</span>
                        </button>
                    )}
                </div>

                <button
                    type="button"
                    onClick={close}
                    className="mt-4 w-full rounded-xl bg-brand-yellow py-3 text-sm font-bold text-black transition active:scale-[0.98]"
                >
                    {t('done')}
                </button>
            </div>
        </div>
    )
}

export default ForMeSheet