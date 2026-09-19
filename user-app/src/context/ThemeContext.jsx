/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

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
