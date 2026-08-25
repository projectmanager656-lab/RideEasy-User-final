import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, withAuth } from '../services/http'
import { stripApiEnvelope } from '../utils/apiBody'

const FAQ_DATA = {
  booking: {
    label: 'Booking',
    icon: 'ri-taxi-line',
    detail: 'Booking and scheduling rides',
    faqs: [
      { q: 'How do I book a ride?', a: 'Enter your pickup and drop locations on the Home screen, select a ride type on Choose Ride, then tap the yellow confirm button.' },
      { q: 'How do I change my pickup location?', a: 'On the Home screen, tap the pickup field and choose a different location from the suggestions.' },
      { q: 'How do I change my destination?', a: 'Tap the drop field on the Home screen and pick another destination, or use the back arrow on Choose Ride to go back and edit.' },
      { q: 'How do I cancel a ride?', a: 'Open your active ride and select Cancel Ride. Follow the confirmation steps shown in the app.' },
      { q: 'Can I cancel a scheduled ride?', a: 'Yes — open the scheduled ride in My Trips and choose Cancel Ride before the pickup time.' },
      { q: 'How do I schedule a ride?', a: 'On Choose Ride, tap the calendar button, pick a date, hour, minutes and AM/PM, then confirm.' },
      { q: 'How do I select a ride type?', a: 'On Choose Ride, tap the ride option you want — like Bike, Auto or a car tier — then confirm.' },
    ],
  },
  payment: {
    label: 'Payment',
    icon: 'ri-wallet-3-line',
    detail: 'Fare and payment issues',
    faqs: [
      { q: 'How is my fare calculated?', a: 'Fare is based on the distance and duration of your trip, plus the selected ride type. The app shows an estimate before you book.' },
      { q: 'Why is my fare different?', a: 'The final fare can change if your route, distance or ride type changes. Your final amount is confirmed before you complete the ride.' },
      { q: 'My payment failed.', a: 'Check that your payment method has sufficient balance, then try again. If it still fails, contact support for help.' },
      { q: 'I was charged incorrectly.', a: 'Please use Report a Problem and choose the Payment issue option so we can review your trip charges.' },
      { q: 'What payment methods are available?', a: 'Cash and UPI are currently supported in RideEasy.' },
    ],
  },
  ride: {
    label: 'Ride Issues',
    icon: 'ri-car-warning-line',
    detail: 'Problems during a ride',
    faqs: [
      { q: 'Driver hasn\'t arrived.', a: 'Wait a few minutes for the driver. If they still don\'t arrive, you can cancel and request another ride, or Report a Problem.' },
      { q: 'Driver cancelled my ride.', a: 'Your ride will be cancelled and you can request a new one. A cancellation fee may apply depending on when it happened.' },
      { q: 'Driver or vehicle doesn\'t match.', a: 'Do not start the ride. Verify the driver and vehicle details, and contact support / Report a Problem immediately.' },
      { q: 'Wrong route taken.', a: 'You can ask the driver to follow the app route. If the issue continues, Report a Problem after the ride.' },
      { q: 'Unsafe driving.', a: 'If you feel unsafe during a trip, activate SOS from the Safety screen. After the ride, use Report a Problem to flag the issue.' },
      { q: 'Wrong fare charged.', a: 'Use Report a Problem and select the Wrong fare option with your trip details.' },
      { q: 'Ride completed incorrectly.', a: 'Report the issue with the ride details and we will review your trip.' },
    ],
  },
  account: {
    label: 'Account',
    icon: 'ri-user-settings-line',
    detail: 'Login and account problems',
    faqs: [
      { q: 'How do I log in?', a: 'Open the app and sign in with your registered phone number and OTP.' },
      { q: 'I forgot my account details.', a: 'Use the phone number you registered with to sign in again and receive a new OTP.' },
      { q: 'How do I update my profile?', a: 'Go to Account in the bottom navigation and edit your display name or saved addresses.' },
    ],
  },
}

const CATEGORY_IDS = [ 'booking', 'payment', 'ride', 'account' ]

const PROBLEM_TYPES = [
  'Driver issue',
  'Vehicle issue',
  'Payment issue',
  'Wrong fare',
  'Wrong route',
  'Safety issue',
  'Ride cancellation',
  'Other',
]

/** Map a user-facing problem type to the backend support-ticket category. */
function ticketCategoryFor (problemType) {
  switch (problemType) {
    case 'Payment issue':
    case 'Wrong fare':
      return 'Payment'
    case 'Account':
      return 'account'
    case 'Safety issue':
    case 'Other':
      return 'other'
    default:
      return 'ride'
  }
}

const AccordionItem = ({ faq }) => {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-brand-border bg-brand-card">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left">
        <span className="text-sm font-medium text-white">{faq.q}</span>
        <i className={`text-brand-yellow ${open ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}`} aria-hidden />
      </button>
      {open && <p className="border-t border-brand-border px-3.5 py-3 text-sm leading-relaxed text-zinc-300">{faq.a}</p>}
    </div>
  )
}

const Section = ({ title, icon, children }) => (
  <section className="rounded-2xl border border-brand-border bg-brand-card p-4">
    <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
      <i className={`${icon} text-brand-yellow`} aria-hidden />
      {title}
    </h2>
    {children}
  </section>
)

const HelpSupport = () => {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeCat, setActiveCat] = useState('booking')

  // Report a problem
  const [reportOpen, setReportOpen] = useState(false)
  const [reportRide, setReportRide] = useState('')
  const [reportType, setReportType] = useState(PROBLEM_TYPES[0])
  const [reportDesc, setReportDesc] = useState('')
  const [reportPhotoName, setReportPhotoName] = useState('')
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [reportError, setReportError] = useState('')
  const [reportDone, setReportDone] = useState(false)
  const fileRef = useRef(null)

  // Lost item
  const [lostOpen, setLostOpen] = useState(false)
  const [rides, setRides] = useState([])
  const [ridesLoading, setRidesLoading] = useState(true)
  const [lostRide, setLostRide] = useState('')
  const [lostItem, setLostItem] = useState('')
  const [lostSubmitting, setLostSubmitting] = useState(false)
  const [lostError, setLostError] = useState('')
  const [lostDone, setLostDone] = useState(false)

  useEffect(() => {
    setReportDone(false)
    setReportError('')
  }, [reportOpen])

  useEffect(() => {
    setLostDone(false)
    setLostError('')
    if (!lostOpen) return
    let cancelled = false
    setRidesLoading(true)
    apiClient
      .get('/rides/history', withAuth({ params: { limit: 50 } }))
      .then((res) => {
        if (cancelled) return
        const raw = stripApiEnvelope(res.data)
        setRides(Array.isArray(raw?.rides) ? raw.rides : [])
      })
      .catch(() => { if (!cancelled) setRides([]) })
      .finally(() => { if (!cancelled) setRidesLoading(false) })
    return () => { cancelled = true }
  }, [lostOpen])

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/home')
  }

  /** Search across every category's FAQs + category labels/titles. */
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    const hits = []
    CATEGORY_IDS.forEach((id) => {
      const data = FAQ_DATA[id]
      data.faqs.forEach((faq) => {
        const hay = `${faq.q} ${faq.a} ${data.label}`.toLowerCase()
        if (hay.includes(q)) hits.push({ ...faq, category: data.label })
      })
    })
    return hits
  }, [query])

  const submitReport = async () => {
    if (reportDesc.trim().length < 2) {
      setReportError('Please describe the issue.')
      return
    }
    setReportSubmitting(true)
    setReportError('')
    try {
      await apiClient.post('/support-tickets', {
        rideId: reportRide || null,
        category: ticketCategoryFor(reportType),
        subject: reportType,
        description: `[${reportType}] ${reportDesc.trim()}`,
      }, withAuth())
      setReportDone(true)
    } catch {
      setReportError('Unable to submit report. Please try again.')
    } finally {
      setReportSubmitting(false)
    }
  }

  const submitLostItem = async () => {
    if (lostItem.trim().length < 2) {
      setLostError('Please describe the lost item.')
      return
    }
    setLostSubmitting(true)
    setLostError('')
    const ride = rides.find((r) => String(r._id) === String(lostRide))
    const rideLabel = ride
      ? `${ride.pickupLocation || ''} → ${ride.dropLocation || ''}`
      : 'No ride selected'
    try {
      await apiClient.post('/support-tickets', {
        rideId: lostRide || null,
        category: 'other',
        subject: 'Lost item report',
        description: `Lost item: ${lostItem.trim()}\nRide: ${rideLabel}`,
      }, withAuth())
      setLostDone(true)
    } catch {
      setLostError('Unable to submit report. Please try again.')
    } finally {
      setLostSubmitting(false)
    }
  }

  const categoryCard = (id) => {
    const data = FAQ_DATA[id]
    const isActive = activeCat === id && !query
    return (
      <button
        key={id}
        type="button"
        onClick={() => setActiveCat(id)}
        className={[
          'w-full rounded-xl border px-3.5 py-3 text-left transition active:scale-[0.99]',
          isActive ? 'border-brand-yellow bg-brand-card' : 'border-brand-border bg-brand-card/40',
        ].join(' ')}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <i className={`${data.icon} text-brand-yellow`} aria-hidden />
          {data.label}
        </span>
        <span className="mt-0.5 block text-xs text-zinc-400">{data.detail}</span>
      </button>
    )
  }

  return (
    <div className="min-h-dvh min-h-screen w-full overflow-x-hidden bg-black text-white pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-800 bg-black/90 px-3 py-3 backdrop-blur sm:gap-3 sm:px-4">
        <button type="button" onClick={handleBack} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-200 active:scale-95" aria-label="Back">
          <i className="ri-arrow-left-line text-lg" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">Help & Support</h1>
      </header>

      <div className="mx-auto w-full max-w-lg space-y-4 px-3 pt-4 sm:px-4">
        {/* Search */}
        <Section title="Search Help" icon="ri-search-line">
          <div className="relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for help..."
              className="w-full rounded-xl border border-brand-border bg-brand-card pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-brand-yellow"
            />
          </div>
        </Section>

        {/* Search results or categories */}
        {query ? (
          <section className="rounded-2xl border border-brand-border bg-brand-card p-4">
            <h2 className="mb-3 text-sm font-bold text-white">Results</h2>
            {searchResults.length === 0 ? (
              <p className="text-sm text-zinc-400">No matching help articles found.</p>
            ) : (
              <div className="space-y-2">
                {searchResults.map((r, i) => (
                  <div key={i} className="rounded-xl border border-brand-border bg-brand-cardSoft/60 p-3">
                    <p className="text-sm font-medium text-white">{r.q}</p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-300">{r.a}</p>
                    <span className="mt-2 inline-block rounded-full bg-brand-yellow/10 px-2 py-0.5 text-[10px] font-semibold text-brand-yellow">{r.category}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {/* Categories */}
            <section className="space-y-2">
              {CATEGORY_IDS.map(categoryCard)}
              <button
                type="button"
                onClick={() => setLostOpen(true)}
                className="w-full rounded-xl border border-brand-border bg-brand-card/40 px-3.5 py-3 text-left transition active:scale-[0.99]"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  <i className="ri-luggage-cart-line text-brand-yellow" aria-hidden />
                  Lost Item
                </span>
                <span className="mt-0.5 block text-xs text-zinc-400">Report something you lost</span>
              </button>
            </section>

            {/* Active category FAQs */}
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white">{FAQ_DATA[activeCat].label}</h2>
              {FAQ_DATA[activeCat].faqs.map((faq, i) => <AccordionItem key={i} faq={faq} />)}
            </section>

            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="w-full rounded-xl border border-brand-yellow bg-brand-yellow/10 py-3 text-sm font-semibold text-brand-yellow active:scale-[0.99]"
            >
              📝 Report a Problem
            </button>
          </>
        )}

        {/* Contact support */}
        <Section title="Contact Support" icon="ri-customer-service-2-line">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => alert('Support call is not configured yet. Please use Report a Problem.')}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-border bg-brand-card py-3 text-sm font-semibold text-white active:scale-[0.98]"
            >
              <i className="ri-phone-line text-brand-yellow" aria-hidden /> Call Support
            </button>
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-border bg-brand-card py-3 text-sm font-semibold text-white active:scale-[0.98]"
            >
              <i className="ri-chat-3-line text-brand-yellow" aria-hidden /> Live Chat
            </button>
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-border bg-brand-card py-3 text-sm font-semibold text-white active:scale-[0.98]"
            >
              <i className="ri-clipboard-line text-brand-yellow" aria-hidden /> Report a Problem
            </button>
          </div>
        </Section>

        {/* FAQ */}
        <Section title="Frequently Asked Questions" icon="ri-question-answer-line">
          <div className="space-y-2">
            {[
              'How do I book a ride?',
              'How do I cancel a ride?',
              'How do I schedule a ride?',
              'How is my fare calculated?',
              'How do I change pickup/drop location?',
              'What should I do if my driver doesn\'t arrive?',
              'What should I do if I lose an item?',
              'How do I report a safety problem?',
            ].map((q, i) => {
              let ans = ''
              CATEGORY_IDS.forEach((id) => {
                const f = FAQ_DATA[id].faqs.find((x) => x.q === q)
                if (f) ans = f.a
              })
              return <AccordionItem key={i} faq={{ q, a: ans || 'Please contact support for help with this topic.' }} />
            })}
          </div>
        </Section>
      </div>

      {/* Report a problem modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-[1px]">
          <div className="max-h-[90dvh] w-full max-w-[440px] overflow-y-auto rounded-t-2xl border-t border-brand-border bg-[#101010] p-4 pb-6">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-700" />
            <h3 className="mb-3 text-base font-bold text-white">Report a Problem</h3>
            {reportDone ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-6 text-center">
                <i className="ri-checkbox-circle-line text-4xl text-emerald-400" aria-hidden />
                <p className="mt-2 text-sm font-semibold text-white">Your report has been submitted successfully.</p>
                <button type="button" onClick={() => setReportOpen(false)} className="mt-4 w-full rounded-xl border border-brand-border bg-brand-card py-3 text-sm font-semibold text-white active:scale-[0.98]">Close</button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">Ride</label>
                  <select
                    value={reportRide}
                    onChange={(e) => setReportRide(e.target.value)}
                    className="w-full rounded-xl border border-brand-border bg-brand-card px-3 py-2.5 text-sm text-white outline-none focus:border-brand-yellow"
                  >
                    <option value="">No ride selected</option>
                    <option value="active">Current ride</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">Problem Type</label>
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    className="w-full rounded-xl border border-brand-border bg-brand-card px-3 py-2.5 text-sm text-white outline-none focus:border-brand-yellow"
                  >
                    {PROBLEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">Description</label>
                  <textarea
                    value={reportDesc}
                    onChange={(e) => setReportDesc(e.target.value)}
                    rows={3}
                    placeholder="Describe the issue..."
                    className="w-full resize-none rounded-xl border border-brand-border bg-brand-card px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-brand-yellow"
                  />
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setReportPhotoName(e.target.files?.[0]?.name || '')}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-border bg-brand-card py-3 text-sm font-semibold text-white active:scale-[0.98]"
                >
                  <i className="ri-camera-line text-brand-yellow" aria-hidden />
                  {reportPhotoName ? reportPhotoName : 'Add Photo / Screenshot'}
                </button>
                {/* Integration point: photo upload is not yet wired to the backend. */}
                {reportError && <p className="text-xs text-red-400">{reportError}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setReportOpen(false)} className="flex-1 rounded-xl border border-brand-border bg-brand-card py-3 text-sm font-semibold text-white active:scale-[0.98]">Cancel</button>
                  <button type="button" onClick={submitReport} disabled={reportSubmitting} className="flex-1 rounded-xl bg-brand-yellow py-3 text-sm font-bold text-black active:scale-[0.98] disabled:opacity-50">
                    {reportSubmitting ? 'Submitting...' : 'Submit Report'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lost item modal */}
      {lostOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-[1px]">
          <div className="max-h-[90dvh] w-full max-w-[440px] overflow-y-auto rounded-t-2xl border-t border-brand-border bg-[#101010] p-4 pb-6">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-700" />
            <h3 className="mb-3 text-base font-bold text-white">Lost Something?</h3>
            <p className="mb-3 text-sm text-zinc-400">Report an item you lost during a RideEasy trip.</p>
            {lostDone ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-6 text-center">
                <i className="ri-checkbox-circle-line text-4xl text-emerald-400" aria-hidden />
                <p className="mt-2 text-sm font-semibold text-white">Your lost item report has been submitted successfully.</p>
                <button type="button" onClick={() => setLostOpen(false)} className="mt-4 w-full rounded-xl border border-brand-border bg-brand-card py-3 text-sm font-semibold text-white active:scale-[0.98]">Close</button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">Select a Ride</label>
                  {ridesLoading ? (
                    <p className="text-sm text-zinc-400">Loading rides...</p>
                  ) : rides.length === 0 ? (
                    <p className="text-sm text-zinc-500">No past rides available.</p>
                  ) : (
                    <select
                      value={lostRide}
                      onChange={(e) => setLostRide(e.target.value)}
                      className="w-full rounded-xl border border-brand-border bg-brand-card px-3 py-2.5 text-sm text-white outline-none focus:border-brand-yellow"
                    >
                      <option value="">Select a ride</option>
                      {rides.map((r) => (
                        <option key={r._id} value={r._id}>
                          {new Date(r.createdAt || r.completedAt || Date.now()).toLocaleDateString()} · {r.pickupLocation || ''} → {r.dropLocation || ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">Item description</label>
                  <input
                    value={lostItem}
                    onChange={(e) => setLostItem(e.target.value)}
                    placeholder="e.g. Black backpack"
                    className="w-full rounded-xl border border-brand-border bg-brand-card px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-brand-yellow"
                  />
                </div>
                {lostError && <p className="text-xs text-red-400">{lostError}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setLostOpen(false)} className="flex-1 rounded-xl border border-brand-border bg-brand-card py-3 text-sm font-semibold text-white active:scale-[0.98]">Cancel</button>
                  <button type="button" onClick={submitLostItem} disabled={lostSubmitting} className="flex-1 rounded-xl bg-brand-yellow py-3 text-sm font-bold text-black active:scale-[0.98] disabled:opacity-50">
                    {lostSubmitting ? 'Submitting...' : 'Submit Lost Item Report'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default HelpSupport