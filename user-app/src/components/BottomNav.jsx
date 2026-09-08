import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useLanguage } from '../i18n'

const BottomNav = ({ onMoreClick }) => {
  const { t } = useLanguage()
  const location = useLocation()
  const path = location.pathname
  const hidden =
    path === '/login' ||
    path === '/signup' ||
    path === '/welcome' ||
    path === '/user/logout' ||
    path === '/location'

  if (hidden) return null

  const base =
    'flex flex-col items-center justify-center flex-1 gap-0.5 text-xs font-medium transition-colors'

  const itemCls = (isActive) =>
    `${base} ${isActive ? 'text-brand' : 'text-zinc-500'}`

  return (
    <nav
      className="shrink-0 border-t bg-[#050505]"
      style={{ borderTopColor: '#222222', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto flex h-[68px] max-w-[430px] items-center justify-between px-1 min-[400px]:px-3 sm:px-4">
        <NavLink
          to="/home"
          className={({ isActive }) => itemCls(isActive)}
        >
          <i className="ri-home-5-line text-lg" />
          <span className="max-[380px]:text-[10px]">{t('book')}</span>
        </NavLink>
        <NavLink
          to="/riding"
          className={() => itemCls(path === '/riding')}
        >
          <i className="ri-roadster-line text-lg" />
          <span className="max-[380px]:text-[10px]">{t('live')}</span>
        </NavLink>
        <NavLink
          to="/history"
          className={({ isActive }) => itemCls(isActive)}
        >
          <i className="ri-history-line text-lg" />
          <span className="max-[380px]:text-[10px]">{t('trips')}</span>
        </NavLink>
        <NavLink
          to="/profile"
          className={({ isActive }) => itemCls(isActive)}
        >
          <i className="ri-user-3-line text-lg" />
          <span className="max-[380px]:text-[10px]">{t('profile')}</span>
        </NavLink>
        <button
          type="button"
          onClick={onMoreClick}
          aria-label="More"
          className={`${base} cursor-pointer bg-transparent border-0 text-[#777777]`}
        >
          <i className="ri-more-line text-xl" />
          <span className="max-[380px]:text-[10px]">More</span>
        </button>
      </div>
    </nav>
  )
}

export default BottomNav