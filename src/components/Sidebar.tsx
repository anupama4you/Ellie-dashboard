'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Phone, CalendarDays, Clock, MessageSquare, BarChart3, Building2, Plug, Settings, LogOut, ShieldCheck, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { setLineActive } from '@/app/(dashboard)/actions'

const NAV = [
  { href: '/',             label: 'Dashboard',           icon: LayoutDashboard },
  { href: '/calls',        label: 'Calls',               icon: Phone           },
  { href: '/appointments', label: 'Appointments',        icon: CalendarDays    },
  { href: '/recordings',   label: 'Recordings',          icon: Clock           },
  { href: '/sms',          label: 'SMS log',             icon: MessageSquare   },
  { href: '/analytics',    label: 'Analytics',           icon: BarChart3       },
  { href: '/briefing',     label: 'Business', icon: Building2       },
  { href: '/integrations', label: 'Integrations',        icon: Plug            },
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

type PlanUsageSummary = {
  used: number
  limit: number | null
  pct: number | null
  isTrial: boolean
  trialDaysLeft: number | null
  renewsLabel: string
}

type Props = {
  businessName: string
  userEmail: string
  coveragePct: number
  streakDays: number
  isAdmin?: boolean
  usage?: PlanUsageSummary | null
  linePaused: boolean
  hasAssistant: boolean
  transferPhoneNumber: string | null
  phoneNumber: string | null
}

export default function Sidebar({
  businessName, userEmail, coveragePct, streakDays, isAdmin, usage,
  linePaused, hasAssistant, transferPhoneNumber, phoneNumber,
}: Props) {
  const pathname = usePathname()
  const router   = useRouter()

  const [paused, setPaused]           = useState(linePaused)
  const [confirmTarget, setConfirmTarget] = useState<'pause' | 'resume' | null>(null)
  const [toggleError, setToggleError] = useState('')
  const [isToggling, startToggle]     = useTransition()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  function confirmToggle() {
    if (!confirmTarget) return
    setToggleError('')
    startToggle(async () => {
      try {
        await setLineActive(confirmTarget === 'resume')
        setPaused(confirmTarget === 'pause')
        setConfirmTarget(null)
        router.refresh()
      } catch (err) {
        setToggleError(err instanceof Error ? err.message : 'Failed to update line status')
      }
    })
  }

  return (
    <>
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

      {/* Phone line toggle */}
      {hasAssistant && (
        <div
          className="rounded-xl px-3.5 py-3"
          style={{ border: '1px solid var(--night-line)', background: 'var(--night-2)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {paused ? (
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#736C90' }} />
              ) : (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--signal)' }} />
                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: 'var(--signal)' }} />
                </span>
              )}
              <b className="text-[0.85rem] text-white font-semibold">
                {paused ? 'Line paused' : 'Phone number active'}
              </b>
            </div>
            <button
              onClick={() => setConfirmTarget(paused ? 'resume' : 'pause')}
              role="switch" aria-checked={!paused}
              className="w-[34px] h-[20px] rounded-full relative shrink-0 transition-colors"
              style={{ background: paused ? 'rgba(255,255,255,0.15)' : 'var(--signal)' }}
            >
              <span className="absolute top-[2.5px] w-[15px] h-[15px] rounded-full bg-white transition-all" style={{ left: paused ? 2.5 : 16.5 }} />
            </button>
          </div>
          <p className="text-[0.72rem] leading-relaxed mt-1.5" style={{ color: '#8B84A6' }}>
            {paused
              ? `Calls forward straight to ${transferPhoneNumber ?? 'your number'} — Ellie isn't answering.`
              : `Ellie is answering calls${phoneNumber ? ` on ${phoneNumber}` : ''}.`}
          </p>
        </div>
      )}

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
          {usage.isTrial ? (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <b className="text-[0.85rem] text-white font-semibold">Free trial</b>
                <span className="text-[0.76rem] font-mono" style={{ color: 'var(--amber)' }}>{usage.used} calls</span>
              </div>
              <p className="text-[0.72rem]" style={{ color: '#736C90' }}>
                Unlimited calls · {usage.trialDaysLeft != null && usage.trialDaysLeft > 0
                  ? `${usage.trialDaysLeft} day${usage.trialDaysLeft !== 1 ? 's' : ''} left`
                  : 'trial ended'}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <b className="text-[0.85rem] text-white font-semibold">Monthly usage</b>
                <span className="text-[0.76rem] font-mono" style={{ color: '#8B84A6' }}>{usage.used}/{usage.limit}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(usage.pct ?? 0, 100)}%`,
                    background: (usage.pct ?? 0) >= 100 ? 'var(--coral)' : (usage.pct ?? 0) >= 80 ? 'var(--amber)' : 'var(--signal)',
                  }}
                />
              </div>
              <p className="text-[0.72rem] mt-1.5" style={{ color: '#736C90' }}>
                Renews {usage.renewsLabel}
              </p>
            </>
          )}
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

    {confirmTarget && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(20,16,32,0.5)' }} onClick={() => setConfirmTarget(null)}>
        <div
          className="w-full max-w-sm rounded-2xl p-5 flex flex-col gap-3.5"
          style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
              {confirmTarget === 'pause' ? 'Pause your phone line?' : 'Turn Ellie back on?'}
            </h2>
            <button onClick={() => setConfirmTarget(null)} style={{ color: 'var(--ink-3)' }} aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
            {confirmTarget === 'pause'
              ? `Callers${phoneNumber ? ` to ${phoneNumber}` : ''} won't reach Ellie until you turn this back on — they'll be forwarded straight to ${transferPhoneNumber ?? 'your transfer number'} instead.`
              : `Ellie will start answering calls${phoneNumber ? ` on ${phoneNumber}` : ''} again right away.`}
          </p>

          {toggleError && (
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--coral-soft)' }}>
              <p className="text-xs" style={{ color: 'var(--coral)' }}>{toggleError}</p>
            </div>
          )}

          <div className="flex gap-2 mt-1">
            <button onClick={() => setConfirmTarget(null)} className="flex-1 rounded-xl py-2.5 text-sm font-bold btn-ghost" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}>
              Cancel
            </button>
            <button
              onClick={confirmToggle}
              disabled={isToggling}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ background: confirmTarget === 'pause' ? 'var(--coral)' : 'var(--violet)' }}
            >
              {isToggling ? 'Saving…' : confirmTarget === 'pause' ? 'Pause line' : 'Resume'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
