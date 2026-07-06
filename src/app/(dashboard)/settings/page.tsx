import { getCurrentBusiness } from '@/lib/business'
import { Settings2, Building2, Phone, CreditCard, Bot, Mail, Info, Bell } from 'lucide-react'
import NotificationToggles from '@/components/NotificationToggles'
import type { NotificationPrefs } from './actions'

const FIELD_ICONS: Record<string, { icon: React.ReactNode; bg: string; border: string }> = {
  'Business Name':     {
    icon:   <Building2 size={13} style={{ color: 'var(--violet)' }} />,
    bg:     'var(--violet-soft)',
    border: 'rgba(109,74,255,0.2)',
  },
  'Phone Number':      {
    icon:   <Phone size={13} style={{ color: 'var(--rose)' }} />,
    bg:     'rgba(158,123,255,0.1)',
    border: 'rgba(158,123,255,0.2)',
  },
  'Plan':              {
    icon:   <CreditCard size={13} style={{ color: 'var(--signal)' }} />,
    bg:     'var(--signal-soft)',
    border: 'rgba(15,163,122,0.2)',
  },
  'Vapi Assistant ID': {
    icon:   <Bot size={13} style={{ color: 'var(--violet)' }} />,
    bg:     'var(--violet-soft)',
    border: 'rgba(109,74,255,0.2)',
  },
  'Account Email':     {
    icon:   <Mail size={13} style={{ color: 'var(--amber)' }} />,
    bg:     'var(--amber-soft)',
    border: 'rgba(217,138,11,0.2)',
  },
}

const DEFAULT_PREFS: NotificationPrefs = {
  bookingTexts: true,
  morningBrief: true,
  urgentAlerts: true,
  weeklyReport: true,
}

export default async function SettingsPage() {
  const { user, business: biz } = await getCurrentBusiness()

  const fields = [
    { label: 'Business Name',    value: biz?.name              },
    { label: 'Phone Number',     value: biz?.phone             },
    { label: 'Plan',             value: biz?.plan              },
    { label: 'Vapi Assistant ID',value: biz?.vapi_assistant_id },
    { label: 'Account Email',    value: user?.email            },
  ]

  const prefs: NotificationPrefs = biz?.notification_prefs ?? DEFAULT_PREFS

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[900px] mx-auto flex flex-col gap-5">
        <div>
          <h1 className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--ink)' }}>
            Settings
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>Your account, your Ellie number and your plan</p>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {/* Account details */}
          <section className="rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center gap-2.5 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
              <Settings2 size={14} style={{ color: 'var(--violet)' }} />
              <h2 className="text-sm font-bold flex-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Account details</h2>
            </div>

            <div
              className="mx-5 mt-4 mb-1 flex items-start gap-2.5 px-3.5 py-3 rounded-xl"
              style={{ background: 'var(--violet-soft)', border: '1px solid rgba(109,74,255,0.15)' }}
            >
              <Info size={13} style={{ color: 'var(--violet)', flexShrink: 0, marginTop: 1 }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                To update any of these details, please contact your Ellie account manager.
              </p>
            </div>

            <div className="mt-3 pb-1">
              {fields.map(({ label, value }, i) => {
                const meta = FIELD_ICONS[label] ?? { icon: null, bg: 'var(--paper)', border: 'var(--line)' }
                return (
                  <div
                    key={label}
                    className="flex justify-between items-center px-5 py-3.5 gap-4 hover-row transition-colors"
                    style={{ borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
                      >
                        {meta.icon}
                      </span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>{label}</span>
                    </div>
                    <span
                      className="text-sm font-mono truncate max-w-[180px]"
                      style={{ color: value ? 'var(--ink-2)' : 'var(--ink-3)' }}
                      title={value ?? undefined}
                    >
                      {value ?? '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Notifications */}
          <section className="rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center gap-2.5 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
              <Bell size={14} style={{ color: 'var(--violet)' }} />
              <div>
                <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Notifications</h2>
                <p className="text-xs" style={{ color: 'var(--ink-3)' }}>How Ellie keeps you in the loop</p>
              </div>
            </div>
            {biz?.id && <NotificationToggles businessId={biz.id} initialPrefs={prefs} />}
          </section>
        </div>

        <div className="flex items-center justify-center gap-2">
          <span className="w-1 h-1 rounded-full" style={{ background: 'rgba(109,74,255,0.35)' }} />
          <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
            Ellie Dashboard · Powered by{' '}
            <span className="gradient-text font-semibold">anupama.dev</span>
          </p>
          <span className="w-1 h-1 rounded-full" style={{ background: 'rgba(109,74,255,0.35)' }} />
        </div>
      </div>
    </div>
  )
}
