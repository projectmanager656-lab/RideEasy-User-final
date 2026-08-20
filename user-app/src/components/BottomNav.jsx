import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useLanguage } from '../i18n'

  const BottomNav = () => {
  const { t } = useLanguage()
  const location = useLocation()
  const path = location.pathname
  const hidden =
    path === '/login' ||
    path === '/signup' ||
    path === '/welcome' ||
    path === '/user/logout'

  if (hidden) return null

  const base =
    'flex flex-col items-center justify-center flex-1 gap-0.5 text-xs font-medium transition-colors'

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[110] border-t border-zinc-800 bg-black/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >

      <div className="mx-auto flex h-16 max-w-lg items-center justify-between px-1 min-[400px]:px-2">
        <NavLink
          to="/home"
          className={({ isActive }) =>
            `${base} ${isActive ? 'text-brand' : 'text-zinc-500'}`
          }
        >
          <i className="ri-map-pin-line text-xl" />
          <span className="text-[10px] sm:text-xs">{t('book')}</span>
        </NavLink>
        <NavLink
          to="/riding"
          className={() =>
            `${base} ${path === '/riding' ? 'text-brand' : 'text-zinc-500'}`
          }
        >
          <i className="ri-roadster-line text-xl" />
          <span className="text-[10px] sm:text-xs">{t('live')}</span>
        </NavLink>

        <NavLink
          to="/history"
          className={({ isActive }) =>
            `${base} ${isActive ? 'text-brand' : 'text-zinc-500'}`
          }
        >
          <i className="ri-history-line text-xl" />
          <span className="text-[10px] sm:text-xs">{t('trips')}</span>
        </NavLink>
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `${base} ${isActive ? 'text-brand' : 'text-zinc-500'}`
          }
        >
          <i className="ri-user-3-line text-xl" />
          <span className="text-[10px] sm:text-xs">{t('profile')}</span>
        </NavLink>
      </div>
    </nav>
  )
}

export default BottomNav
