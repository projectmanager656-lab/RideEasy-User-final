import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'

const BottomNav = ({ onMoreClick }) => {
  const location = useLocation()
  const path = location.pathname
  const hidden =
    path === '/login' ||
    path === '/signup' ||
    path === '/user/logout' ||
    path === '/location'

  if (hidden) return null

  const base =
    'flex flex-col items-center justify-center flex-1 gap-0.5 text-xs font-medium transition-colors'

  return (
    <nav
      className="shrink-0 border-t bg-[#050505]"
      style={{ borderTopColor: '#222222', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto flex h-[68px] max-w-[430px] items-center justify-between px-1 min-[400px]:px-3 sm:px-4">
        <NavLink
          to="/home"
          className={({ isActive }) =>
            `${base} ${isActive ? 'text-[#FFC800]' : 'text-[#777777]'}`
          }
        >
          <i className="ri-home-5-line text-lg" />
          <span className="max-[380px]:text-[10px]">Home</span>
        </NavLink>
        <button
          type="button"
          onClick={onMoreClick}
          aria-label="More"
          className={`${base} cursor-pointer bg-transparent border-0 text-[#777777]`}
        >
          <i className="ri-more-2-line text-lg" />
          <span className="max-[380px]:text-[10px]">More</span>
        </button>
        <NavLink
          to="/history"
          className={({ isActive }) =>
            `${base} ${isActive ? 'text-[#FFC800]' : 'text-[#777777]'}`
          }
        >
          <i className="ri-history-line text-lg" />
          <span className="max-[380px]:text-[10px]">History</span>
        </NavLink>
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `${base} ${isActive ? 'text-[#FFC800]' : 'text-[#777777]'}`
          }
        >
          <i className="ri-user-3-line text-lg" />
          <span className="max-[380px]:text-[10px]">Account</span>
        </NavLink>
      </div>
    </nav>
  )
}

export default BottomNav