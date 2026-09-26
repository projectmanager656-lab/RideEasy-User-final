import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, withAuth } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'
import { useLanguage } from '../i18n'

const WELCOME_ID = 'welcome'
const MAX_INPUT_CHARS = 1000
const MAX_COMPOSER_PX = 96

/** Quick support topics — each one is sent to the real AI as a user message. */
const QUICK_OPTION_KEYS = [
  'chat_opt_ride_issue',
  'chat_opt_driver_not_arrived',
  'chat_opt_driver_late',
  'chat_opt_fare_payment',
  'chat_opt_cancel_ride',
  'chat_opt_lost_item',
  'chat_opt_safety',
  'chat_opt_account',
  'chat_opt_booking',
  'chat_opt_other',
]

const formatTime = (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const AssistantAvatar = () => (
  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
    <i className="ri-customer-service-2-line text-sm" aria-hidden />
  </span>
)

const TypingBubble = ({ label }) => (
  <div className="flex items-end gap-2" role="status" aria-label={label}>
    <AssistantAvatar />
    <div className="rounded-2xl rounded-bl-sm border border-theme bg-theme-card px-3.5 py-3">
      <span className="flex items-center gap-1" aria-hidden>
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-theme-muted" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-theme-muted" style={{ animationDelay: '120ms' }} />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-theme-muted" style={{ animationDelay: '240ms' }} />
      </span>
    </div>
  </div>
)

const LiveChat = () => {
  const navigate = useNavigate()
  const { t, language } = useLanguage()

  const [messages, setMessages] = useState(() => ([
    { id: WELCOME_ID, role: 'assistant', content: t('chat_greeting'), at: Date.now() },
  ]))
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [optionsOpen, setOptionsOpen] = useState(true)
  const failedMessageRef = useRef('')
  const listRef = useRef(null)
  const composerRef = useRef(null)
  const seqRef = useRef(0)

  const scrollToLatest = () => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  useEffect(() => {
    scrollToLatest()
  }, [ messages, sending, error, optionsOpen ])

  /** Grow the composer with its content instead of scrolling a single line. */
  useEffect(() => {
    const el = composerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_PX)}px`
  }, [ input ])

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/help')
  }

  const send = useCallback(async (raw) => {
    const content = String(raw || '').trim()
    if (!content || sending) return

    const history = messages
      .filter((m) => m.id !== WELCOME_ID && !m.failed)
      .map((m) => ({ role: m.role, content: m.content }))

    seqRef.current += 1
    const userId = `m-${seqRef.current}`
    setMessages((prev) => [ ...prev, { id: userId, role: 'user', content, at: Date.now() } ])
    setInput('')
    setError('')
    setOptionsOpen(false)
    setSending(true)

    try {
      const res = await apiClient.post('/chat', { message: content, history, language }, withAuth())
      const data = stripApiEnvelope(res.data)
      const reply = typeof data?.reply === 'string' ? data.reply.trim() : ''
      if (!reply) throw new Error('Empty reply')
      failedMessageRef.current = ''
      seqRef.current += 1
      const assistantId = `m-${seqRef.current}`
      setMessages((prev) => [ ...prev, { id: assistantId, role: 'assistant', content: reply, at: Date.now() } ])
    } catch (err) {
      /* Never surface raw provider/network detail — backend messages are already user-safe. */
      const status = err?.response?.status
      const backendMessage = typeof err?.response?.data?.message === 'string' ? err.response.data.message.trim() : ''
      let message = t('chat_error_generic')
      if (status === 401) message = t('chat_error_session')
      else if (status === 429) message = backendMessage || t('chat_error_busy')
      else if (backendMessage && backendMessage.length <= 160) message = backendMessage

      failedMessageRef.current = content
      setMessages((prev) => prev.map((m) => (m.id === userId ? { ...m, failed: true } : m)))
      setError(message)
    } finally {
      setSending(false)
    }
  }, [ messages, sending, language, t ])

  const retry = () => {
    const content = failedMessageRef.current
    if (!content || sending) return
    setMessages((prev) => prev.filter((m) => !m.failed))
    setError('')
    void send(content)
  }

  const onSubmit = (event) => {
    event.preventDefault()
    void send(input)
  }

  /** Enter sends; Shift+Enter keeps the newline (multiline composer). */
  const onComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send(input)
    }
  }

  const canSend = !sending && input.trim().length > 0

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-theme-bg text-theme-primary">
      <header className="flex shrink-0 items-center gap-3 border-b border-theme bg-theme-bg/90 px-4 pt-4 pb-3 backdrop-blur">
        <button
          type="button"
          onClick={handleBack}
          aria-label={t('back')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-theme bg-theme-card text-brand active:scale-95"
        >
          <i className="ri-arrow-left-line text-xl" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold tracking-tight">{t('chat_title')}</h1>
          <p className="truncate text-[11px] text-theme-muted">{t('chat_subtitle')}</p>
        </div>
      </header>

      {/* Only this area scrolls — header and composer stay fixed. */}
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 scrollbar-hide"
      >
        {messages.map((m) => {
          const isUser = m.role === 'user'
          return (
            <div key={m.id} className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && <AssistantAvatar />}
              <div className="max-w-[78%]">
                <div
                  className={[
                    'whitespace-pre-wrap break-words px-3.5 py-2.5 text-sm leading-relaxed',
                    isUser
                      ? 'rounded-2xl rounded-br-sm bg-brand text-brand-ink'
                      : 'rounded-2xl rounded-bl-sm border border-theme bg-theme-card text-theme-primary',
                    m.failed ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  {m.content}
                </div>
                <p className={`mt-1 text-[10px] text-theme-muted ${isUser ? 'text-right' : ''}`}>
                  {m.failed ? t('chat_not_sent') : formatTime(m.at)}
                </p>
              </div>
            </div>
          )
        })}

        {sending && <TypingBubble label={t('chat_typing')} />}

        {optionsOpen && (
          <div className="rounded-2xl border border-theme bg-theme-card p-3.5">
            <p className="mb-2.5 text-xs text-theme-secondary">{t('chat_select_option')}</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_OPTION_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={sending}
                  onClick={() => void send(t(key))}
                  className="rounded-full border border-theme bg-theme-card-muted px-3 py-1.5 text-xs font-medium text-theme-primary transition active:scale-95 disabled:opacity-50"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="shrink-0 border-t border-theme bg-theme-bg px-3 py-3">
        {error && (
          <div role="alert" className="mb-2 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
            <i className="ri-error-warning-line shrink-0 text-base text-red-400" aria-hidden />
            <p className="min-w-0 flex-1 text-xs text-theme-primary">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="shrink-0 rounded-full border border-theme bg-theme-card px-3 py-1 text-xs font-semibold text-theme-primary active:scale-95"
            >
              {t('chat_retry')}
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setOptionsOpen((open) => !open)}
            aria-label={t('chat_options')}
            aria-pressed={optionsOpen}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition active:scale-95 ${
              optionsOpen
                ? 'border-brand-yellow bg-brand-yellow/15 text-brand-yellow'
                : 'border-theme bg-theme-card text-theme-secondary'
            }`}
          >
            <i className="ri-apps-2-line text-lg" aria-hidden />
          </button>

          <textarea
            ref={composerRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onComposerKeyDown}
            onFocus={scrollToLatest}
            placeholder={t('chat_input_placeholder')}
            aria-label={t('chat_input_placeholder')}
            rows={1}
            maxLength={MAX_INPUT_CHARS}
            autoComplete="off"
            className="min-w-0 flex-1 resize-none rounded-2xl border border-theme bg-theme-input px-4 py-3 text-sm leading-snug text-theme-primary placeholder:text-theme-muted outline-none focus:border-brand-yellow scrollbar-hide"
          />

          <button
            type="submit"
            disabled={!canSend}
            aria-label={t('chat_send')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-yellow text-black transition active:scale-95 disabled:opacity-40"
          >
            <i className={sending ? 'ri-loader-4-line animate-spin text-lg' : 'ri-send-plane-2-fill text-lg'} aria-hidden />
          </button>
        </div>

        <p className="mt-2 text-center text-[10px] text-theme-muted">{t('chat_ai_disclaimer')}</p>
      </form>
    </div>
  )
}

export default LiveChat
