import React from 'react'

export default function PricingTab ({ pricingJson, setPricingJson, savePricing, pricingLoading }) {
  if (pricingLoading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center text-neutral-600 shadow-xl">
        Loading pricing…
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6 shadow-xl">
      <p className="mb-3 text-xs sm:text-sm text-neutral-600">
        JSON with <code className="rounded border border-neutral-200 bg-neutral-100 px-1 font-mono text-black">rates</code> (per-vehicle{' '}
        <code className="rounded border border-neutral-200 bg-neutral-100 px-1 font-mono text-black">baseFare</code>,{' '}
        <code className="rounded border border-neutral-200 bg-neutral-100 px-1 font-mono text-black">perKm</code>,{' '}
        <code className="rounded border border-neutral-200 bg-neutral-100 px-1 font-mono text-black">platformFee</code>) and{' '}
        <code className="rounded border border-neutral-200 bg-neutral-100 px-1 font-mono text-black">driverPlans</code> (weekly/monthly/yearly ₹ per vehicle type). Both are stored in MongoDB.
      </p>
      <textarea
        className="h-64 sm:h-72 w-full rounded-xl border border-neutral-300 bg-neutral-50 p-3 sm:p-4 font-mono text-xs sm:text-sm text-black focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
        value={pricingJson}
        onChange={(e) => setPricingJson(e.target.value)}
      />
      <button
        type="button"
        onClick={savePricing}
        className="mt-4 rounded-lg bg-black px-4 py-2.5 sm:px-5 text-xs sm:text-sm font-semibold text-white hover:bg-neutral-800"
      >
        Save pricing
      </button>
    </div>
  )
}
