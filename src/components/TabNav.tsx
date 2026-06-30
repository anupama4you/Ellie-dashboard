'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Sun, CalendarDays, BarChart3, Phone, Settings, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ThemeToggle from '@/components/ThemeToggle'

const TABS = [
  { href: '/',         label: 'Today',    icon: Sun          },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/calls',    label: 'Calls',    icon: Phone        },
  { href: '/reports',  label: 'Reports',  icon: BarChart3    },
]

function isActive(href: string, pathname: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function TabNav() {
  const pathname = usePathname()
  const router   = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="shrink-0" style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--b2)' }}>
      <div className="flex items-center px-5 gap-3 h-[60px]">

        {/* Logo */}
        <Image
          src="/logo.png"
          alt="Ellie"
          width={120}
          height={36}
          style={{ height: 32, width: 'auto' }}
          className="shrink-0"
          priority
        />

        <div className="w-px h-5 shrink-0" style={{ background: 'var(--b3)' }} />

        {/* Tabs */}
        <nav className="flex items-center gap-1 flex-1">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href, pathname)
            return (
              <Link
                key={href}
                href={href}
                className={`nav-tab${active ? ' active' : ''}`}
                style={!active ? { border: '1px solid transparent' } : undefined}
              >
                <Icon
                  size={13}
                  style={{ color: active ? '#a78bfa' : 'var(--t4)', flexShrink: 0 }}
                />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Right side controls */}
        <div className="flex items-center gap-1">
          {/* Live badge */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mr-2"
            style={{
              background: 'rgba(52,211,153,0.07)',
              border: '1px solid rgba(52,211,153,0.16)',
              color: '#34d399',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-ellie-pulse"
              style={{ background: '#34d399', boxShadow: '0 0 4px #34d399' }}
            />
            Live
          </div>

          <ThemeToggle />

          <Link
            href="/settings"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors btn-ghost"
            style={{ color: isActive('/settings', pathname) ? '#a78bfa' : 'var(--t4)' }}
            title="Settings"
          >
            <Settings size={14} />
          </Link>

          <button
            onClick={signOut}
            className="group w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/10"
            style={{ color: 'var(--t4)' }}
            title="Sign out"
          >
            <LogOut size={14} className="group-hover:text-red-400 transition-colors" />
          </button>
        </div>
      </div>
    </div>
  )
}
