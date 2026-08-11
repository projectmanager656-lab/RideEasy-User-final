import React, { useContext, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CaptainDataContext } from '../context/CaptainContext'
import { apiClient, withCaptainAuth } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'

const DriverProfile = () => {
  const { captain, setCaptain } = useContext(CaptainDataContext)
  const [upiId, setUpiId] = useState('')
  const [paymentQrUrl, setPaymentQrUrl] = useState('')
  const [accountHolderName, setAccountHolderName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [ifscCode, setIfscCode] = useState('')
  const [bankUpiId, setBankUpiId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setUpiId(captain?.upiId || '')
    setPaymentQrUrl(captain?.paymentQrUrl || '')
    const b = captain?.bankDetails || {}
    setAccountHolderName(b.accountHolderName || '')
    setAccountNumber(b.accountNumber || '')
    setIfscCode(b.ifscCode || '')
    setBankUpiId(b.upiId || '')
  }, [captain?._id, captain?.upiId, captain?.paymentQrUrl, captain?.bankDetails])

  const savePayee = async () => {
    const bFields = [ accountHolderName.trim(), accountNumber.trim(), ifscCode.trim(), bankUpiId.trim() || upiId.trim() ]
    const bFilled = bFields.filter(Boolean).length
    const hadBank = captain?.bankDetails && String(captain.bankDetails.accountNumber || '').trim()
    if (bFilled > 0 && bFilled < 4) {
      alert('Bank details: fill all four fields (holder, account, IFSC, UPI) or clear all to remove.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        upiId: upiId.trim().toLowerCase(),
        paymentQrUrl: paymentQrUrl.trim(),
      }
      if (bFilled === 4) {
        payload.bankDetails = {
          accountHolderName: accountHolderName.trim(),
          accountNumber: accountNumber.trim().replace(/\s+/g, ''),
          ifscCode: ifscCode.trim().toUpperCase(),
          upiId: (bankUpiId.trim() || upiId.trim()).toLowerCase(),
        }
      } else if (bFilled === 0 && hadBank) {
        payload.bankDetails = {}
      }
      const res = await apiClient.patch('/captains/profile', payload, withCaptainAuth())
      const body = stripApiEnvelope(res.data)
      const cap = body?.captain ?? body
      if (cap && setCaptain) setCaptain((prev) => ({ ...(prev || {}), ...cap }))
    } catch (e) {
      alert(e.response?.data?.message || e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }
  const displayName =
    captain?.name
    || (captain?.fullname
      ? `${captain.fullname.firstname || ''} ${captain.fullname.lastname || ''}`.trim()
      : '')
    || 'Driver'

  return (
    <div className="min-h-dvh min-h-screen bg-black text-white pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-800 bg-black/90 px-4 py-3 backdrop-blur">
        <Link to="/captain-home" className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-zinc-200">
          <i className="ri-arrow-left-line text-lg" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold">Profile</h1>
          <p className="text-xs text-zinc-400">Account & vehicle</p>
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-4 px-4 pt-6">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-xl font-bold text-emerald-400">
              {displayName.charAt(0)}
            </div>
            <div>
              <p className="text-lg font-semibold">{displayName}</p>
              <p className="text-sm text-zinc-400">{captain?.phone || '—'}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4 text-sm">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Passenger payments</p>
            <label className="block text-xs text-zinc-400 mb-1">Your UPI ID</label>
            <input
              className="mb-3 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="you@paytm"
            />
            <label className="block text-xs text-zinc-400 mb-1">Payment QR (image URL or data URL)</label>
            <input
              className="mb-3 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 text-xs"
              value={paymentQrUrl}
              onChange={(e) => setPaymentQrUrl(e.target.value)}
              placeholder="https://… or data:image/…"
            />
            <div className="border-t border-zinc-800 pt-4 mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Bank payouts</p>
              <label className="block text-xs text-zinc-400 mb-1">Account holder</label>
              <input
                className="mb-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                placeholder="Name as per bank"
              />
              <label className="block text-xs text-zinc-400 mb-1">Account number</label>
              <input
                className="mb-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                placeholder="9–18 digits"
              />
              <label className="block text-xs text-zinc-400 mb-1">IFSC</label>
              <input
                className="mb-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 uppercase"
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                placeholder="HDFC0001234"
              />
              <label className="block text-xs text-zinc-400 mb-1">UPI (bank record)</label>
              <input
                className="mb-3 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
                value={bankUpiId}
                onChange={(e) => setBankUpiId(e.target.value)}
                placeholder="Same as passenger UPI if one account"
              />
              <p className="text-[11px] text-zinc-500 mb-2">Clear all four bank fields and save to remove stored bank details.</p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={savePayee}
              className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save payment details'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-3 text-sm">
          <div className="flex justify-between gap-2 border-b border-zinc-800 pb-2">
            <span className="text-zinc-500">Email</span>
            <span className="text-right text-zinc-200">{captain?.email || '—'}</span>
          </div>
          <div className="flex justify-between gap-2 border-b border-zinc-800 pb-2">
            <span className="text-zinc-500">City</span>
            <span className="text-right text-zinc-200">{captain?.city || '—'}</span>
          </div>
          <div className="flex justify-between gap-2 border-b border-zinc-800 pb-2">
            <span className="text-zinc-500">Vehicle</span>
            <span className="text-right text-zinc-200">
              {captain?.vehicleType || '—'} · {captain?.vehicleNumber || '—'}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500">Status</span>
            <span className="text-right capitalize text-emerald-400">
              {captain?.status === 'active' ? 'Online-ready' : captain?.status || '—'}
            </span>
          </div>
        </div>

        <Link
          to="/captain/logout"
          className="flex w-full items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-900 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
        >
          Log out
        </Link>
      </div>
    </div>
  )
}

export default DriverProfile
