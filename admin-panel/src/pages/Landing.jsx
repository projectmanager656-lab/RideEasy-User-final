import React from 'react'
import { Link } from 'react-router-dom'

const Landing = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-50 px-4">
      <div className="w-full max-w-md bg-slate-950/80 border border-slate-800 rounded-2xl shadow-2xl p-8 space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/40 mb-1">
            <span className="text-2xl font-black text-emerald-400">R</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">RideEasy</h1>
          <p className="text-sm text-slate-400">
            Choose how you want to sign in and start your ride.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            to="/login"
            className="block w-full text-center bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2.5 rounded-lg transition"
          >
            Continue as User
          </Link>
          <Link
            to="/captain-login"
            className="block w-full text-center bg-slate-800 hover:bg-slate-700 text-slate-50 font-semibold py-2.5 rounded-lg transition"
          >
            Continue as Driver
          </Link>
          <Link
            to="/admin"
            className="block w-full text-center border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-medium py-2.5 rounded-lg transition"
          >
            Admin Login
          </Link>
        </div>

        <div className="text-xs text-center text-slate-500">
          Pune &amp; Kolhapur • Safe, affordable city rides
        </div>
      </div>
    </div>
  )
}

export default Landing
