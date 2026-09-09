import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { buildUpiQrImageUrl } from '../config/externalEndpoints'
import { useLanguage } from '../i18n'

const PENDING_KEY = 'rideeasy_upi_pending'
const PENDING_MAX_MS = 15 * 60 * 1000

/**
 * Desktop browsers (and Chrome DevTools “mobile emulation”) often have no app that registers `upi://`.
 * Only attempt window navigation when we believe a real phone / native app can handle the scheme.
 */
async function shouldNavigateToUpiScheme() {
    const ua = navigator.userAgent || ''
    const looksMobileUa = /Android|iPhone|iPad|iPod/i.test(ua)

    if (Capacitor.isNativePlatform()) {
        return Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios'
    }

    if (!looksMobileUa) return false

    if (typeof navigator.userAgentData?.mobile === 'boolean' && navigator.userAgentData.mobile === false) {
        return false
    }

    try {
        const uaData = navigator.userAgentData
        if (uaData?.getHighEntropyValues) {
            const { platform } = await uaData.getHighEntropyValues([ 'platform' ])
            const p = String(platform || '').toLowerCase()
            if (p === 'windows' || p === 'macos' || p === 'linux' || p === 'chrome os') {
                return false
            }
        }
    } catch (_) {
        /* ignore */
    }

    if (/Windows NT|Macintosh|Mac OS X|Linux x86_64|X11/i.test(ua) && !/Android|iPhone|iPad|iPod/i.test(ua)) {
        return false
    }

    return true
}

const Payment = ({
    amount = 0,
    method = 'Cash',
    onMethodChange,
    onContinue,
}) => {
    const { t } = useLanguage()
    const [waitingForConfirmation, setWaitingForConfirmation] = useState(false)
    const [paymentSuccess, setPaymentSuccess] = useState(false)
    const [transactionRef, setTransactionRef] = useState('')
    const [launchHint, setLaunchHint] = useState('')
    const [upiQrUrl, setUpiQrUrl] = useState('')
    const [needsManualConfirm, setNeedsManualConfirm] = useState(false)
    const autoConfirmDoneRef = useRef(false)
    const pendingTxnRef = useRef({ ref: '', amt: 0 })
    const wasHiddenRef = useRef(false)
    const upiPayeeName = import.meta.env.VITE_UPI_PAYEE_NAME || 'RideEasy'
    const upiHandle = import.meta.env.VITE_UPI_HANDLE || import.meta.env.VITE_UPI_ID || ''

    const runAutoConfirm = useCallback(() => {
        if (autoConfirmDoneRef.current) return
        autoConfirmDoneRef.current = true
        setPaymentSuccess(true)
        setWaitingForConfirmation(false)
        try {
            sessionStorage.removeItem(PENDING_KEY)
        } catch (_) {}
        const ref = pendingTxnRef.current.ref || transactionRef
        const amt = pendingTxnRef.current.amt || Number(amount || 0)
        window.setTimeout(() => {
            onContinue?.({
                paymentAttempted: true,
                transactionRef: ref,
                status: 'SUCCESS',
                amount: amt,
            })
        }, 700)
    }, [amount, onContinue, transactionRef])

    const openUpiApp = async () => {
        setLaunchHint('')
        setPaymentSuccess(false)
        autoConfirmDoneRef.current = false
        if (!upiHandle || !upiHandle.includes('@')) {
            alert('UPI handle configured नाही. .env मध्ये VITE_UPI_HANDLE सेट करा.')
            return
        }
        const txnRef = `txn_${Date.now()}`
        const params = new URLSearchParams({
            pa: upiHandle,
            pn: upiPayeeName,
            am: Number(amount || 0).toFixed(2),
            cu: 'INR',
            tn: 'Ride booking payment',
            tr: txnRef,
        })
        const upiUrl = `upi://pay?${params.toString()}`
        const qr = buildUpiQrImageUrl(upiUrl)
        setUpiQrUrl(qr)

        pendingTxnRef.current = { ref: txnRef, amt: Number(amount || 0) }

        const canDeepLink = await shouldNavigateToUpiScheme()
        if (!canDeepLink) {
            setLaunchHint(t('upi_app_launch_hint'))
            setWaitingForConfirmation(true)
            setNeedsManualConfirm(true)
            setTransactionRef(txnRef)
            return
        }

        setNeedsManualConfirm(false)
        wasHiddenRef.current = false
        try {
            sessionStorage.setItem(
                PENDING_KEY,
                JSON.stringify({ ref: txnRef, amt: Number(amount || 0), ts: Date.now() })
            )
        } catch (_) {}

        window.location.href = upiUrl
        setTransactionRef(txnRef)
        setWaitingForConfirmation(true)
    }

    // Resume after returning from UPI app (same page): hidden → visible
    useEffect(() => {
        if ((method !== 'UPI' && method !== 'Online') || needsManualConfirm) return

        const tryConfirm = () => {
            if (autoConfirmDoneRef.current) return
            let raw
            try {
                raw = sessionStorage.getItem(PENDING_KEY)
            } catch (_) {
                raw = null
            }
            if (!raw) return
            try {
                const parsed = JSON.parse(raw)
                if (Date.now() - parsed.ts > PENDING_MAX_MS) {
                    sessionStorage.removeItem(PENDING_KEY)
                    return
                }
                pendingTxnRef.current = { ref: parsed.ref, amt: Number(parsed.amt) }
            } catch (_) {
                return
            }
            runAutoConfirm()
        }

        const onVisibility = () => {
            if (document.visibilityState === 'hidden') {
                wasHiddenRef.current = true
                return
            }
            if (document.visibilityState !== 'visible') return
            if (!wasHiddenRef.current) return
            wasHiddenRef.current = false
            tryConfirm()
        }

        const onFocus = () => {
            if (autoConfirmDoneRef.current) return
            let raw
            try {
                raw = sessionStorage.getItem(PENDING_KEY)
            } catch (_) {
                raw = null
            }
            if (!raw || !waitingForConfirmation) return
            tryConfirm()
        }

        document.addEventListener('visibilitychange', onVisibility)
        window.addEventListener('focus', onFocus)
        return () => {
            document.removeEventListener('visibilitychange', onVisibility)
            window.removeEventListener('focus', onFocus)
        }
    }, [ method, needsManualConfirm, waitingForConfirmation, runAutoConfirm ])

    const isUpiLike = method === 'UPI' || method === 'Online'

    const showConfirmButton =
        !isUpiLike ||
        needsManualConfirm ||
        (!waitingForConfirmation && !paymentSuccess)

    return (
        <div className="rounded-2xl border border-theme bg-theme-card p-4 shadow-sm">
            <p className="text-sm font-semibold text-theme-primary">{t('payment')}</p>
            <p className="text-xs text-theme-muted mt-1">{t('complete_payment_to_confirm')}</p>

            <div className="mt-3 grid grid-cols-3 gap-2">
                {['Cash', 'UPI', 'Online'].map((m) => (
                    <button
                        key={m}
                        type="button"
                        onClick={() => {
                            onMethodChange?.(m)
                            setWaitingForConfirmation(false)
                            setPaymentSuccess(false)
                            if (m !== 'UPI' && m !== 'Online') {
                                try {
                                    sessionStorage.removeItem(PENDING_KEY)
                                } catch (_) {}
                            }
                        }}
                        className={`rounded-lg border px-2 py-2 text-xs font-medium sm:text-sm ${
                            method === m ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-theme text-theme-secondary'
                        }`}
                    >
                        {m}
                    </button>
                ))}
            </div>

            <div className="mt-3 rounded-lg bg-theme-card-muted p-3 text-sm text-theme-secondary">
                {t('amount_label')} <span className="font-semibold text-theme-primary">₹{amount}</span>
                {isUpiLike && (
                    <p className="mt-1 text-xs text-theme-muted">{t('upi_payee_label')} {upiPayeeName}</p>
                )}
            </div>

            {isUpiLike && (
                <>
                    <button
                        type="button"
                        onClick={openUpiApp}
                        disabled={paymentSuccess}
                        className="mt-3 w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                        {method === 'Online' ? t('pay_online_upi_apps') : t('pay_with_upi_apps')} — ₹{amount}
                    </button>
                    {waitingForConfirmation && !paymentSuccess && (
                        <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                            {t('waiting_payment_confirmation')}
                        </div>
                    )}
                    {paymentSuccess && (
                        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                            {t('payment_success_confirming')}
                        </div>
                    )}
                    {launchHint && (
                        <div className="mt-2 rounded-lg border border-theme bg-theme-card-muted px-3 py-2 text-xs text-theme-muted">
                            {launchHint}
                        </div>
                    )}
                    {!!upiQrUrl && (
                        <div className="mt-3 rounded-lg border border-theme bg-theme-card p-3 text-center">
                            <p className="text-xs text-theme-muted mb-2">{t('upi_qr_fallback')}</p>
                            <img src={upiQrUrl} alt={t('upi_qr_alt')} className="mx-auto h-44 w-44 rounded-md border border-theme" />
                        </div>
                    )}
                </>
            )}

            {showConfirmButton && (
                <button
                    type="button"
                    onClick={() =>
                        onContinue?.({
                            paymentAttempted: !isUpiLike || needsManualConfirm,
                            transactionRef,
                            status: isUpiLike && needsManualConfirm ? 'SUCCESS' : 'PENDING',
                            amount: Number(amount || 0),
                        })
                    }
                    className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                    {t('confirm_ride')} (₹{amount})
                </button>
            )}
        </div>
    )
}

export default Payment
