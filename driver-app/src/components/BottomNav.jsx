import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'

const BottomNav = () => {
  const location = useLocation()
  const path = location.pathname
  const hidden =
    path === '/captain-login' ||
    path === '/captain-signup' ||
    path === '/captain/logout'

  if (hidden) return null

  const base =
    'flex flex-col items-center justify-center flex-1 gap-0.5 text-[10px] font-medium transition-colors sm:text-xs'

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-800 bg-black/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-0.5 sm:px-2">
        <NavLink
          to="/captain-home"
          className={({ isActive }) =>
            `${base} ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`
          }
        >
          <i className="ri-dashboard-3-line text-lg" />
          <span className="max-[360px]:hidden">Home</span>
        </NavLink>
        <NavLink
          to="/earnings"
          className={({ isActive }) =>
            `${base} ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`
          }
        >
          <i className="ri-wallet-3-line text-lg" />
          <span className="max-[360px]:hidden">Earn</span>
        </NavLink>
        <NavLink
          to="/history"
          className={({ isActive }) =>
            `${base} ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`
          }
        >
          <i className="ri-history-line text-lg" />
          <span className="max-[360px]:hidden">Trips</span>
        </NavLink>
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `${base} ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`
          }
        >
          <i className="ri-user-3-line text-lg" />
          <span className="max-[360px]:hidden">Me</span>
        </NavLink>
      </div>
    </nav>
  )
}

export default BottomNav
