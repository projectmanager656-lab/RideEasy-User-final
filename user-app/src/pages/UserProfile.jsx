import React, { useCallback, useContext, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UserDataContext } from '../context/UserContext'
import { apiClient, withAuth } from '../services/http'
import { formatApiError } from '../utils/apiError'
import { stripApiEnvelope } from '../utils/apiBody'

const UserProfile = () => {
  const { user, setUser, refreshUser } = useContext(UserDataContext)
  const navigate = useNavigate()
  const [ name, setName ] = useState('')
  const [ home, setHome ] = useState('')
  const [ work, setWork ] = useState('')
  const [ saving, setSaving ] = useState(false)
  const [ syncing, setSyncing ] = useState(false)
  const [ message, setMessage ] = useState('')
  const [ error, setError ] = useState('')

  useEffect(() => {
    setName(user?.name || '')
    setHome(user?.savedAddresses?.home || '')
    setWork(user?.savedAddresses?.work || '')
  }, [ user?._id, user?.name, user?.savedAddresses?.home, user?.savedAddresses?.work ])

  const pullLatest = useCallback(async () => {
    setSyncing(true)
    setError('')
    try {
      const r = await refreshUser()
      if (!r?.ok) {
        setError('Could not refresh profile. Try again.')
      }
    } catch {
      setError('Could not refresh profile. Try again.')
    } finally {
      setSyncing(false)
    }
  }, [ refreshUser ])

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const { data } = await apiClient.patch('/users/profile', {
        name: name.trim(),
        savedAddresses: { home: home.trim(), work: work.trim() },
      }, withAuth())
      const body = stripApiEnvelope(data)
      const u = body?.user ?? body
      if (u && typeof u === 'object') setUser(u)
      setMessage('Saved.')
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setSaving(false)
    }
  }

  const logout = () => {
    navigate('/user/logout', { replace: true })
  }

  const uid = user?._id ? String(user._id) : ''

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-800 bg-black/90 px-4 py-3 backdrop-blur">
        <Link to="/home" className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-zinc-200">
          <i className="ri-arrow-left-line text-lg" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">Profile</h1>
          <p className="text-xs text-zinc-500">Your account & saved places</p>
        </div>
        <button
          type="button"
          onClick={() => void pullLatest()}
          disabled={syncing}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          aria-label="Refresh profile"
        >
          <i className={`ri-refresh-line text-lg ${syncing ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <div className="mx-auto max-w-md space-y-6 px-4 pt-6">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Account</h2>
          <p className="mt-3 text-sm text-white">
            <span className="text-zinc-500">Name · </span>
            {user?.name || '—'}
          </p>
          <p className="mt-2 text-sm text-white">
            <span className="text-zinc-500">Phone · </span>
            {user?.phone || '—'}
          </p>
          <p className="mt-2 text-sm text-white break-all">
            <span className="text-zinc-500">Email · </span>
            {user?.email || '—'}
          </p>
          {user?.city ? (
            <p className="mt-2 text-sm text-white">
              <span className="text-zinc-500">City · </span>
              {user.city}
            </p>
          ) : null}
          {uid ? (
            <p className="mt-3 text-[11px] text-zinc-600 font-mono break-all" title="User id">
              ID · {uid}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-zinc-600">
            Phone and email are used to sign in. Only your display name and saved addresses can be updated below.
          </p>
        </section>

        <form onSubmit={save} className="space-y-4">
          {error ? (
            <div role="alert" className="rounded-xl border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200 whitespace-pre-line">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
              {message}
            </div>
          ) : null}

          <div>
            <label className="block text-xs font-medium text-zinc-500">Display name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              placeholder="Your name"
              minLength={2}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500">Home address</label>
            <input
              value={home}
              onChange={(e) => setHome(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              placeholder="Quick pick on the map screen"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500">Work address</label>
            <input
              value={work}
              onChange={(e) => setWork(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              placeholder="Quick pick on the map screen"
            />
          </div>

          <button
            type="submit"
            disabled={saving || syncing}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>

        <button
          type="button"
          onClick={logout}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-900"
        >
          Log out
        </button>
      </div>
    </div>
  )
}

export default UserProfile
