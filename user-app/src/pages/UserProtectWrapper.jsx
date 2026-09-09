import React, { useContext, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserDataContext } from '../context/UserContext'

const spinner = (
  <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 px-6 bg-black text-zinc-400 text-sm">
    <div
      className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500"
      aria-hidden
    />
    <p>Loading your account…</p>
  </div>
)

const UserProtectWrapper = ({ children }) => {
  const {
    authLoading,
    token,
    profileError,
    isAuthenticated,
    refreshUser,
    clearSession,
  } = useContext(UserDataContext)

  const navigate = useNavigate()

  useEffect(() => {
    if (authLoading) return
    if (!token) {
      navigate('/login', { replace: true })
    }
  }, [ authLoading, token, navigate ])

  if (authLoading) {
    return spinner
  }

  if (!token) {
    return null
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 px-6 text-center bg-black text-white">
        <p className="text-zinc-300 text-sm max-w-md">
          {profileError || 'Could not verify your session. Check your connection and try again.'}
        </p>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <button
            type="button"
            className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 text-sm"
            onClick={() => void refreshUser()}
          >
            Retry
          </button>
          <button
            type="button"
            className="rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium px-4 py-2 text-sm"
            onClick={() => {
              clearSession()
              navigate('/login', { replace: true })
            }}
          >
            Sign in again
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export default UserProtectWrapper
