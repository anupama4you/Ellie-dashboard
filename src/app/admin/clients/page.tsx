import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Plus, Pencil, Sparkles, Clock } from 'lucide-react'

const PLAN_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  starter:      { color: 'var(--t3)', bg: 'rgba(139,133,160,0.07)', border: 'rgba(139,133,160,0.15)' },
  core:         { color: 'var(--violet)', bg: 'rgba(109,74,255,0.1)',  border: 'rgba(109,74,255,0.2)'  },
  professional: { color: 'var(--rose)', bg: 'rgba(158,123,255,0.1)',  border: 'rgba(158,123,255,0.2)'  },
  enterprise:   { color: 'var(--amber)', bg: 'rgba(217,138,11,0.1)',   border: 'rgba(217,138,11,0.2)'   },
}

export default async function ClientsPage() {
  const admin = createAdminClient()
  const [{ data: businesses }, { data: { users } }] = await Promise.all([
    admin.from('businesses').select('*').order('created_at', { ascending: false }),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const emailMap = Object.fromEntries((users ?? []).map(u => [u.id, u.email ?? '']))
  const list = businesses ?? []

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Clients</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--t5)' }}>
              {list.length} client{list.length !== 1 ? 's' : ''} registered
            </p>
          </div>
          <Link href="/admin/clients/new"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))', color: '#fff', boxShadow: '0 0 20px rgba(109,74,255,0.2)' }}>
            <Plus size={14} />
            Add Client
          </Link>
        </div>

        {/* Table */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>

          {/* Column headers */}
          <div className="hidden md:grid px-5 py-3 text-xs font-bold tracking-widest uppercase"
            style={{
              gridTemplateColumns: '2fr 2fr 1fr 1.3fr 80px',
              color: 'var(--t5)',
              borderBottom: '1px solid var(--b3)',
              background: 'var(--b6)',
            }}>
            <span>Business</span>
            <span>Email</span>
            <span>Plan</span>
            <span>Assistant</span>
            <span />
          </div>

          {list.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm" style={{ color: 'var(--t5)' }}>No clients yet</p>
              <Link href="/admin/clients/new" className="text-xs mt-1 inline-block" style={{ color: 'var(--violet)' }}>
                Add your first client →
              </Link>
            </div>
          ) : (
            list.map((biz, i) => {
              const s = PLAN_STYLE[biz.plan] ?? PLAN_STYLE.core
              const hasAssistant = !!biz.vapi_assistant_id
              return (
                <div key={biz.id}
                  className="hover-row grid items-center px-5 py-4 gap-3 transition-colors"
                  style={{
                    gridTemplateColumns: '2fr 2fr 1fr 1.3fr 80px',
                    borderBottom: i < list.length - 1 ? '1px solid var(--b4)' : 'none',
                  }}>
                  <Link href={`/admin/clients/${biz.id}`} className="flex items-center gap-2 text-sm font-semibold truncate pr-2 hover:underline" style={{ color: 'var(--text)' }}>
                    <span className="truncate">{biz.name}</span>
                    {biz.briefing_needs_review && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ color: 'var(--amber)', background: 'rgba(217,138,11,0.12)' }}
                        title="Client updated their Briefing — needs review">
                        <Clock size={9} /> Needs review
                      </span>
                    )}
                  </Link>
                  <span className="text-xs truncate pr-2" style={{ color: 'var(--t3)' }}>
                    {emailMap[biz.user_id] ?? '—'}
                  </span>
                  <span>
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold capitalize"
                      style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
                      {biz.plan}
                    </span>
                  </span>
                  <span className="text-xs font-semibold flex items-center gap-1.5"
                    style={{ color: hasAssistant ? 'var(--signal)' : 'var(--t5)' }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: hasAssistant ? 'var(--signal)' : 'var(--t6)' }} />
                    {hasAssistant ? 'Connected' : 'Not connected'}
                  </span>
                  <div className="flex items-center gap-1.5 justify-end">
                    <Link href={`/admin/clients/${biz.id}/briefing`}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors btn-ghost shrink-0"
                      style={{ color: 'var(--t7)' }}
                      title="Ellie's Briefing">
                      <Sparkles size={13} />
                    </Link>
                    <Link href={`/admin/clients/${biz.id}`}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors btn-ghost shrink-0"
                      style={{ color: 'var(--t7)' }}
                      title="Edit details">
                      <Pencil size={13} />
                    </Link>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
