/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

export const THEME_STORAGE_KEY = 'rideeasy_user_theme'
export const THEME_DEFAULT = 'light'

const ThemeContext = createContext(undefined)

function readInitialTheme () {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* ignore */ }
  return THEME_DEFAULT
}

export function ThemeProvider ({ children }) {
  const [ theme, setThemeState ] = useState(readInitialTheme)

  /*
   * Dark ↔ Light handoff. `.theme-transitioning` only enables colour transitions
   * for the brief window while the theme is actually switching — it is added in a
   * layout effect (before paint, so the new colours never snap first) and removed
   * again right after, so normal hover/press feedback stays instant. The theme
   * itself is applied immediately below; nothing waits on this.
   */
  const themeTransitionTimerRef = useRef(null)
  const prevThemeRef = useRef(theme)
  useLayoutEffect(() => {
    const root = document.documentElement
    const previous = prevThemeRef.current
    prevThemeRef.current = theme
    if (previous === theme) return

    root.classList.add('theme-transitioning')
    if (themeTransitionTimerRef.current) clearTimeout(themeTransitionTimerRef.current)
    themeTransitionTimerRef.current = setTimeout(() => {
      root.classList.remove('theme-transitioning')
      themeTransitionTimerRef.current = null
    }, 240)

    return () => {
      if (themeTransitionTimerRef.current) {
        clearTimeout(themeTransitionTimerRef.current)
        themeTransitionTimerRef.current = null
      }
      root.classList.remove('theme-transitioning')
    }
  }, [ theme ])

  const setTheme = useCallback((next) => {
    if (next !== 'light' && next !== 'dark') return
    setThemeState(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch { /* ignore */ }
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((cur) => {
      const next = cur === 'light' ? 'dark' : 'light'
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next)
      } catch { /* ignore */ }
      return next
    })
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.style.colorScheme = theme

    // Keep the Android status bar on the active theme so it reads as part of the
    // app instead of a stray light strip. Capacitor naming is inverted:
    // Style.Dark = light icons (dark background), Style.Light = dark icons (light background).
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }).catch(() => {})
      StatusBar.setBackgroundColor({ color: theme === 'dark' ? '#05070A' : '#FFFFFF' }).catch(() => {})
    }
  }, [ theme ])

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, isLight: theme === 'light', isDark: theme === 'dark' }),
    [ theme, setTheme, toggleTheme ],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme () {
  const ctx = useContext(ThemeContext)
  if (ctx === undefined) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
