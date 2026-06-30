'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'dark',
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const stored = localStorage.getItem('ellie-theme') as Theme | null
    if (stored === 'light') {
      setTheme('light')
      document.documentElement.setAttribute('data-theme', 'light')
    }
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    if (next === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
      localStorage.setItem('ellie-theme', 'light')
    } else {
      document.documentElement.removeAttribute('data-theme')
      localStorage.removeItem('ellie-theme')
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
