import { createClient } from '@/lib/supabase/server'
import { Settings2, Building2, Phone, CreditCard, Bot, Mail, Info } from 'lucide-react'

const FIELD_ICONS: Record<string, { icon: React.ReactNode; bg: string; border: string }> = {
  'Business Name':     {
    icon:   <Building2 size={13} style={{ color: '#a78bfa' }} />,
    bg:     'rgba(167,139,250,0.1)',
    border: 'rgba(167,139,250,0.2)',
  },
  'Phone Number':      {
    icon:   <Phone size={13} style={{ color: '#f472b6' }} />,
    bg:     'rgba(244,114,182,0.1)',
    border: 'rgba(244,114,182,0.2)',
  },
  'Plan':              {
    icon:   <CreditCard size={13} style={{ color: '#34d399' }} />,
    bg:     'rgba(52,211,153,0.1)',
    border: 'rgba(52,211,153,0.2)',
  },
  'Vapi Assistant ID': {
    icon:   <Bot size={13} style={{ color: '#60a5fa' }} />,
    bg:     'rgba(96,165,250,0.1)',
    border: 'rgba(96,165,250,0.2)',
  },
  'Account Email':     {
    icon:   <Mail size={13} style={{ color: '#fbbf24' }} />,
    bg:     'rgba(251,191,36,0.1)',
    border: 'rgba(251,191,36,0.2)',
  },
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: biz } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', user?.id)
    .single()

  const fields = [
    { label: 'Business Name',    value: biz?.name              },
    { label: 'Phone Number',     value: biz?.phone             },
    { label: 'Plan',             value: biz?.plan              },
    { label: 'Vapi Assistant ID',value: biz?.vapi_assistant_id },
    { label: 'Account Email',    value: user?.email            },
  ]

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <main className="flex-1 overflow-y-auto p-6 max-w-xl">

        <div className="card">
          {/* Header */}
          <div className="card-header">
            <div className="w-1 h-4 rounded-full shrink-0" style={{ background: 'linear-gradient(180deg, #a78bfa, #f472b6)' }} />
            <Settings2 size={14} style={{ color: '#a78bfa' }} />
            <h2 className="text-sm font-semibold flex-1" style={{ color: 'var(--text)' }}>Account Details</h2>
          </div>

          {/* Info notice */}
          <div
            className="mx-5 mt-4 mb-1 flex items-start gap-2.5 px-3.5 py-3 rounded-xl"
            style={{ background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.12)' }}
          >
            <Info size={13} style={{ color: '#a78bfa', flexShrink: 0, marginTop: 1 }} />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>
              To update any of these details, please contact your Ellie account manager.
            </p>
          </div>

          {/* Fields */}
          <div className="mt-3 pb-1">
            {fields.map(({ label, value }, i) => {
              const meta = FIELD_ICONS[label] ?? { icon: null, bg: 'var(--bg4)', border: 'var(--border)' }
              return (
                <div
                  key={label}
                  className="flex justify-between items-center px-5 py-4 gap-4 hover-row transition-colors"
                  style={{ borderTop: i > 0 ? '1px solid var(--b4)' : 'none' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
                    >
                      {meta.icon}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--t3)' }}>{label}</span>
                  </div>
                  <span
                    className="text-sm font-mono truncate max-w-[220px]"
                    style={{ color: value ? 'var(--t2)' : 'var(--t5)' }}
                    title={value ?? undefined}
                  >
                    {value ?? '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-center gap-2">
          <span className="w-1 h-1 rounded-full" style={{ background: 'rgba(167,139,250,0.35)' }} />
          <p className="text-xs" style={{ color: 'var(--t5)' }}>
            Ellie Dashboard · Powered by{' '}
            <span className="gradient-text font-semibold">anupama.dev</span>
          </p>
          <span className="w-1 h-1 rounded-full" style={{ background: 'rgba(167,139,250,0.35)' }} />
        </div>

      </main>
    </div>
  )
}
