import React, { useCallback, useContext, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UserDataContext } from '../context/UserContext'
import { apiClient, withAuth } from '../services/http'
import { formatApiError } from '../utils/apiError'

const UserProfile = () => {
  const { user, setUser } = useContext(UserDataContext)
  const navigate = useNavigate()
  const [ name, setName ] = useState('')
  const [ home, setHome ] = useState('')
  const [ work, setWork ] = useState('')
  const [ saving, setSaving ] = useState(false)
  const [ message, setMessage ] = useState('')
  const [ error, setError ] = useState('')

  useEffect(() => {
    setName(user?.name || '')
    setHome(user?.savedAddresses?.home || '')
    setWork(user?.savedAddresses?.work || '')
  }, [ user?._id, user?.name, user?.savedAddresses?.home, user?.savedAddresses?.work ])

  const refreshProfile = useCallback(() => {
    return apiClient.get('/users/profile', withAuth()).then((res) => {
      const u = res.data?.user ?? res.data
      if (u && typeof u === 'object') setUser(u)
      return u
    })
  }, [setUser])

  useEffect(() => {
    refreshProfile().catch(() => {})
  }, [refreshProfile])

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
      const u = data?.user ?? data
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <Link to="/home" className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-200">
          <i className="ri-arrow-left-line text-lg" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold">Profile</h1>
          <p className="text-xs text-slate-400">Account & saved places</p>
        </div>
      </header>

      <form onSubmit={save} className="mx-auto max-w-md space-y-4 px-4 pt-6">
        {error ? (
          <div role="alert" className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
            {message}
          </div>
        ) : null}

        <div>
          <label className="block text-xs font-medium text-slate-400">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            placeholder="Your name"
            minLength={2}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400">Home address</label>
          <input
            value={home}
            onChange={(e) => setHome(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            placeholder="Saved for quick pickup/drop"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400">Work address</label>
          <input
            value={work}
            onChange={(e) => setWork(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            placeholder="Saved for quick pickup/drop"
          />
        </div>

        <p className="text-xs text-slate-500">
          Use saved addresses from the booking screen to fill pickup or drop in one tap.
        </p>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>

        <button
          type="button"
          onClick={logout}
          className="w-full rounded-lg border border-slate-600 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
        >
          Log out
        </button>
      </form>
    </div>
  )
}

export default UserProfile
