'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Phone, CalendarDays, BarChart3, Settings, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/',             label: 'Overview',     icon: LayoutDashboard },
  { href: '/calls',        label: 'Call Logs',    icon: Phone           },
  { href: '/appointments', label: 'Appointments', icon: CalendarDays    },
  { href: '/analytics',    label: 'Analytics',    icon: BarChart3       },
  { href: '/settings',     label: 'Settings',     icon: Settings        },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="flex flex-col w-56 shrink-0 h-full relative"
      style={{
        background: 'linear-gradient(180deg, #07090f 0%, #030712 100%)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}>

      {/* Subtle grid overlay */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(167,139,250,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,0.025) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse 120% 60% at 50% 0%, black 30%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 120% 60% at 50% 0%, black 30%, transparent 100%)',
        }} />

      {/* Top violet glow */}
      <div className="absolute top-0 left-0 right-0 h-32 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 100% at 50% 0%, rgba(167,139,250,0.06) 0%, transparent 100%)' }} />

      {/* Logo */}
      <div className="flex items-center px-5 h-16 shrink-0 relative"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <Image src="/logo.png" alt="Ellie" width={140} height={40} className="h-8 w-auto" />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 relative">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href}
              className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative"
              style={{
                color:      active ? '#e2e8f0' : '#4b5563',
                background: active ? 'linear-gradient(135deg, rgba(167,139,250,0.13), rgba(244,114,182,0.06))' : 'transparent',
                border:     active ? '1px solid rgba(167,139,250,0.18)' : '1px solid transparent',
              }}>
              {/* Icon badge */}
              <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200"
                style={{
                  background: active
                    ? 'linear-gradient(135deg, rgba(167,139,250,0.35), rgba(244,114,182,0.2))'
                    : 'rgba(255,255,255,0.03)',
                  border: active
                    ? '1px solid rgba(167,139,250,0.35)'
                    : '1px solid rgba(255,255,255,0.05)',
                }}>
                <Icon size={13} style={{ color: active ? '#a78bfa' : '#4b5563' }} />
              </span>

              {label}

              {/* Active dot */}
              {active && (
                <span className="absolute right-3 w-1.5 h-1.5 rounded-full animate-ellie-blink"
                  style={{ background: '#a78bfa', boxShadow: '0 0 6px rgba(167,139,250,0.8)' }} />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom area */}
      <div className="px-3 pb-4 flex flex-col gap-2 relative">
        {/* Live indicator */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{
            background: 'rgba(52,211,153,0.05)',
            border: '1px solid rgba(52,211,153,0.13)',
          }}>
          <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-ellie-pulse"
            style={{ background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
          <span className="text-xs font-semibold" style={{ color: '#34d399' }}>Ellie Active</span>
        </div>

        {/* Sign out */}
        <button onClick={signOut}
          className="group flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
          style={{ color: '#374151', border: '1px solid transparent' }}>
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 group-hover:bg-red-500/10"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <LogOut size={13} className="transition-colors duration-200 group-hover:text-red-400" style={{ color: '#4b5563' }} />
          </span>
          <span className="transition-colors duration-200 group-hover:text-red-400">Sign out</span>
        </button>
      </div>
    </aside>
  )
}
