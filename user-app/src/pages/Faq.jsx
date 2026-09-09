import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../i18n'
import { FAQ_DATA, CATEGORY_IDS } from '../utils/faqData'

const AccordionItem = ({ faq }) => {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-theme bg-theme-card">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left">
        <span className="text-sm font-medium text-theme-primary">{faq.q}</span>
        <i className={`text-brand-yellow ${open ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}`} aria-hidden />
      </button>
      {open && <p className="border-t border-theme px-3.5 py-3 text-sm leading-relaxed text-theme-primary">{faq.a}</p>}
    </div>
  )
}

const Faq = () => {
  const navigate = useNavigate()
  const { t } = useLanguage()

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/home')
  }

  return (
    <div className="min-h-dvh min-h-screen w-full overflow-x-hidden bg-theme-bg text-theme-primary pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-theme bg-theme-bg/90 px-3 py-3 backdrop-blur sm:gap-3 sm:px-4">
        <button type="button" onClick={handleBack} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-theme-card text-theme-primary active:scale-95" aria-label={t('back')}>
          <i className="ri-arrow-left-line text-lg" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">{t('faq_title')}</h1>
      </header>

      <div className="mx-auto w-full max-w-lg space-y-4 px-3 pt-4 sm:px-4">
        {CATEGORY_IDS.map((id) => {
          const data = FAQ_DATA[id]
          return (
            <section key={id} className="rounded-2xl border border-theme bg-theme-card p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-theme-primary">
                <i className={`${data.icon} text-brand-yellow`} aria-hidden />
                {data.label}
              </h2>
              <div className="space-y-2">
                {data.faqs.map((faq, i) => <AccordionItem key={i} faq={faq} />)}
              </div>
            </section>
          )
        })}

        <p className="pb-2 text-center text-xs text-theme-muted">
          {t('still_need_help')}
        </p>
      </div>
    </div>
  )
}

export default Faq
