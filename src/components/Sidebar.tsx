'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Phone, CalendarDays, Clock, BarChart3, Building2, Settings, LogOut, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/',             label: 'Dashboard',           icon: LayoutDashboard },
  { href: '/calls',        label: 'Calls',               icon: Phone           },
  { href: '/appointments', label: 'Appointments',        icon: CalendarDays    },
  { href: '/recordings',   label: 'Recordings',          icon: Clock           },
  { href: '/analytics',    label: 'Analytics',           icon: BarChart3       },
  { href: '/briefing',     label: 'Company Information', icon: Building2       },
  { href: '/settings',     label: 'Settings',            icon: Settings        },
]

function isActive(href: string, pathname: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

type PlanUsageSummary = { used: number; limit: number; pct: number; renewsLabel: string }

type Props = {
  businessName: string
  userEmail: string
  coveragePct: number
  streakDays: number
  isAdmin?: boolean
  usage?: PlanUsageSummary | null
}

export default function Sidebar({ businessName, userEmail, coveragePct, streakDays, isAdmin, usage }: Props) {
  const pathname = usePathname()
  const router   = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside
      className="flex flex-col w-[236px] shrink-0 h-full gap-1.5 px-4 py-5"
      style={{ background: 'var(--night)', color: '#DCD6EC' }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-2 pb-5">
        <div className="w-[34px] h-[34px] rounded-[10px] overflow-hidden shrink-0">
          <Image src="/favicon.png" alt="" width={34} height={34} className="w-full h-full object-cover" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-xl leading-none text-white" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.01em' }}>
              Ellie
            </span>
            {isAdmin && (
              <span
                className="text-[0.6rem] px-1.5 py-0.5 rounded-md font-bold tracking-wide"
                style={{ background: 'rgba(217,138,11,0.16)', color: 'var(--amber)', border: '1px solid rgba(217,138,11,0.3)' }}
              >
                ADMIN
              </span>
            )}
          </div>
          <div className="text-[10px] tracking-widest uppercase mt-0.5" style={{ color: '#8B84A6' }}>
            AI Receptionist
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="text-[10px] tracking-widest uppercase px-2.5 pb-1.5" style={{ color: '#736C90' }}>
        Workspace
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href, pathname)
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[0.92rem] font-medium transition-colors"
              style={{
                background: active ? 'var(--night-2)' : 'transparent',
                color: active ? '#fff' : '#B9B2CE',
                boxShadow: active ? 'inset 2px 0 0 var(--violet)' : 'none',
              }}
            >
              <Icon size={17} style={{ opacity: 0.85, flexShrink: 0 }} />
              {label}
            </Link>
          )
        })}
      </nav>

      {isAdmin && (
        <>
          <div className="text-[10px] tracking-widest uppercase px-2.5 pt-4 pb-1.5" style={{ color: '#736C90' }}>
            Operator
          </div>
          <Link
            href="/admin"
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[0.92rem] font-medium transition-colors"
            style={{
              background: pathname.startsWith('/admin') ? 'rgba(217,138,11,0.14)' : 'transparent',
              color: pathname.startsWith('/admin') ? 'var(--amber)' : '#B9B2CE',
              border: `1px solid ${pathname.startsWith('/admin') ? 'rgba(217,138,11,0.3)' : 'transparent'}`,
            }}
          >
            <ShieldCheck size={17} style={{ opacity: 0.9, flexShrink: 0 }} />
            Admin panel
          </Link>
        </>
      )}

      <div className="flex-1" />

      {/* Line status */}
      <div
        className="rounded-xl px-3.5 py-3"
        style={{ border: '1px solid var(--night-line)', background: 'var(--night-2)' }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: 'var(--signal)', boxShadow: '0 0 0 3px rgba(15,163,122,0.22)' }}
          />
          <b className="text-[0.85rem] text-white font-semibold">
            {coveragePct === 100 ? 'Your line is covered' : 'Line needs attention'}
          </b>
        </div>
        <p className="text-[0.76rem] leading-relaxed" style={{ color: '#8B84A6' }}>
          Ellie has answered{' '}
          <span className="font-mono" style={{ color: '#C9B8FF' }}>{coveragePct}%</span> of calls
          {streakDays > 0 && (
            <> for <span className="font-mono" style={{ color: '#C9B8FF' }}>{streakDays} day{streakDays !== 1 ? 's' : ''}</span> straight</>
          )}
          .
        </p>
      </div>

      {/* Plan usage */}
      {usage && (
        <div
          className="rounded-xl px-3.5 py-3 mt-1.5"
          style={{ border: '1px solid var(--night-line)', background: 'var(--night-2)' }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <b className="text-[0.85rem] text-white font-semibold">Monthly usage</b>
            <span className="text-[0.76rem] font-mono" style={{ color: '#8B84A6' }}>{usage.used}/{usage.limit}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(usage.pct, 100)}%`,
                background: usage.pct >= 100 ? 'var(--coral)' : usage.pct >= 80 ? 'var(--amber)' : 'var(--signal)',
              }}
            />
          </div>
          <p className="text-[0.72rem] mt-1.5" style={{ color: '#736C90' }}>
            Renews {usage.renewsLabel}
          </p>
        </div>
      )}

      {/* User */}
      <div className="flex items-center gap-2.5 px-2 pt-3.5">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ background: '#3A2E5C', color: '#C9B8FF' }}
        >
          {initials(userEmail || businessName)}
        </div>
        <div className="min-w-0 flex-1">
          <b className="block text-[0.84rem] text-white font-semibold truncate">{businessName}</b>
          <span className="block text-[0.72rem] truncate" style={{ color: '#8B84A6' }}>{userEmail}</span>
        </div>
        <button
          onClick={signOut}
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors hover:bg-white/5"
          style={{ color: '#8B84A6' }}
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  )
}
