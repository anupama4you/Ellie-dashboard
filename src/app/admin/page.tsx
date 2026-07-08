import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Building2, Zap, Plus } from 'lucide-react'
import { PLAN_LIMITS } from '@/lib/planUsage'

const PLANS = ['starter', 'core', 'professional', 'enterprise'] as const

const PLAN_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  starter:      { color: 'var(--t3)', bg: 'rgba(139,133,160,0.07)', border: 'rgba(139,133,160,0.15)' },
  core:         { color: 'var(--violet)', bg: 'rgba(109,74,255,0.1)',  border: 'rgba(109,74,255,0.2)'  },
  professional: { color: 'var(--rose)', bg: 'rgba(158,123,255,0.1)',  border: 'rgba(158,123,255,0.2)'  },
  enterprise:   { color: 'var(--amber)', bg: 'rgba(217,138,11,0.1)',   border: 'rgba(217,138,11,0.2)'   },
}

export default async function AdminPage() {
  const admin = createAdminClient()
  const { data: businesses } = await admin.from('businesses').select('*')
  const list = businesses ?? []

  const planCounts = PLANS.reduce((acc, p) => {
    acc[p] = list.filter(b => b.plan === p).length
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Admin Panel</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--t5)' }}>Manage all Ellie clients and their packages</p>
          </div>
          <Link href="/admin/clients/new"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))', color: '#fff', boxShadow: '0 0 20px rgba(109,74,255,0.2)' }}>
            <Plus size={14} />
            Add Client
          </Link>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Total Clients',     value: list.length,                                       color: 'var(--violet)', icon: Building2 },
            { label: 'Active Assistants', value: list.filter(b => b.vapi_assistant_id).length,      color: 'var(--signal)', icon: Zap       },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="rounded-2xl px-6 py-5 flex items-center gap-4"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                <Icon size={16} style={{ color }} />
              </div>
              <div>
                <div className="text-3xl font-bold leading-none" style={{ color }}>{value}</div>
                <div className="text-xs mt-1 font-medium" style={{ color: 'var(--t4)' }}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Plan breakdown */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
          <div className="px-5 py-4 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--b3)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Plan Distribution</h2>
            <Link href="/admin/clients" className="text-xs transition-colors hover:text-violet-400"
              style={{ color: 'var(--t7)' }}>
              View all clients →
            </Link>
          </div>
          <div className="p-5 grid grid-cols-4 gap-3">
            {PLANS.map(plan => {
              const s = PLAN_STYLE[plan]
              return (
                <div key={plan} className="rounded-xl p-4 flex flex-col gap-1.5"
                  style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                  <div className="text-2xl font-bold" style={{ color: s.color }}>{planCounts[plan]}</div>
                  <div className="text-xs font-semibold capitalize" style={{ color: s.color }}>{plan}</div>
                  <div className="text-xs" style={{ color: `${s.color}88` }}>
                    {PLAN_LIMITS[plan]} calls/mo
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
