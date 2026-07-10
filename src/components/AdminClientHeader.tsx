import Link from 'next/link'
import { ArrowLeft, IdCard, Building2, ScrollText } from 'lucide-react'

const PLAN_STYLE: Record<string, { color: string; bg: string }> = {
  starter:      { color: 'var(--t3)',     bg: 'rgba(139,133,160,0.1)' },
  core:         { color: 'var(--violet)', bg: 'rgba(109,74,255,0.12)' },
  professional: { color: 'var(--rose)',   bg: 'rgba(158,123,255,0.12)' },
  enterprise:   { color: 'var(--amber)',  bg: 'rgba(217,138,11,0.12)' },
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

type Props = {
  id: string
  name: string
  email: string
  plan: string
  planStatus?: string | null
  hasAssistant: boolean
  active: 'details' | 'briefing' | 'prompt'
}

export default function AdminClientHeader({ id, name, email, plan, planStatus, hasAssistant, active }: Props) {
  const planStyle = PLAN_STYLE[plan] ?? PLAN_STYLE.core

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link href="/admin/clients"
          className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors btn-ghost shrink-0"
          style={{ color: 'var(--t3)', border: '1px solid var(--border)' }}>
          <ArrowLeft size={14} />
        </Link>

        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{ background: 'rgba(109,74,255,0.15)', color: 'var(--violet)' }}>
          {initials(name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold truncate" style={{ color: 'var(--text)' }}>{name}</h1>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize" style={{ color: planStyle.color, background: planStyle.bg }}>
              {plan}
            </span>
            {planStatus === 'trial' && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: 'var(--violet)', background: 'rgba(109,74,255,0.12)' }}>
                Trial
              </span>
            )}
            {planStatus === 'cancelled' && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: 'var(--coral)', background: 'rgba(221,81,64,0.1)' }}>
                Cancelled
              </span>
            )}
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1.5"
              style={{
                color: hasAssistant ? 'var(--signal)' : 'var(--coral)',
                background: hasAssistant ? 'rgba(15,163,122,0.1)' : 'rgba(221,81,64,0.1)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: hasAssistant ? 'var(--signal)' : 'var(--coral)' }} />
              {hasAssistant ? 'Assistant connected' : 'No assistant'}
            </span>
          </div>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--t4)' }}>{email}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1" style={{ borderBottom: '1px solid var(--border)' }}>
        {[
          { key: 'details' as const,  href: `/admin/clients/${id}`,          label: 'Details',              icon: IdCard     },
          { key: 'briefing' as const, href: `/admin/clients/${id}/briefing`, label: 'Company Information',  icon: Building2  },
          { key: 'prompt' as const,   href: `/admin/clients/${id}/prompt`,   label: 'System Prompt',        icon: ScrollText },
        ].map(({ key, href, label, icon: Icon }) => {
          const isActive = active === key
          return (
            <Link
              key={key}
              href={href}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors relative -mb-px"
              style={{
                color: isActive ? 'var(--violet)' : 'var(--t3)',
                borderBottom: `2px solid ${isActive ? 'var(--violet)' : 'transparent'}`,
              }}
            >
              <Icon size={14} />
              {label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
