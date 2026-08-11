import React from 'react'
import { Link } from 'react-router-dom'
import CaptainDetails from '../components/CaptainDetails'

/**
 * Dedicated renewal screen when subscription / trial is inactive (redirected from CaptainProtectWrapper).
 */
export default function DriverPlans () {
  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-black text-zinc-100 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Driver</p>
            <h1 className="text-lg font-semibold">Renew subscription</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Your trial or plan has ended. Choose a plan below to go online and accept rides again.
            </p>
          </div>
          <Link
            to="/captain-home"
            className="shrink-0 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-900"
          >
            Dashboard
          </Link>
        </div>
        <CaptainDetails />
      </div>
    </div>
  )
}
