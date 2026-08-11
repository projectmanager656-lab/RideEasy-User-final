import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'

const BottomNav = () => {
  const location = useLocation()
  const path = location.pathname
  const hidden =
    path === '/login' ||
    path === '/signup' ||
    path === '/user/logout'

  if (hidden) return null

  const base =
    'flex flex-col items-center justify-center flex-1 gap-0.5 text-xs font-medium transition-colors'

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-800 bg-black/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-1 min-[400px]:px-3 sm:px-4">
        <NavLink
          to="/home"
          className={({ isActive }) =>
            `${base} ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`
          }
        >
          <i className="ri-map-pin-line text-lg" />
          <span className="max-[380px]:text-[10px]">Book</span>
        </NavLink>
        <NavLink
          to="/riding"
          className={() =>
            `${base} ${path === '/riding' ? 'text-emerald-400' : 'text-zinc-500'}`
          }
        >
          <i className="ri-roadster-line text-lg" />
          <span className="max-[380px]:text-[10px]">Live</span>
        </NavLink>
        <NavLink
          to="/history"
          className={({ isActive }) =>
            `${base} ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`
          }
        >
          <i className="ri-history-line text-lg" />
          <span className="max-[380px]:text-[10px]">Trips</span>
        </NavLink>
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `${base} ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`
          }
        >
          <i className="ri-user-3-line text-lg" />
          <span className="max-[380px]:text-[10px]">Profile</span>
        </NavLink>
      </div>
    </nav>
  )
}

export default BottomNav
