'use client'

import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/context/theme'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors btn-ghost"
      style={{ color: 'var(--t4)' }}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
      {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  )
}
