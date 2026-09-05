import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Plus, Pencil, Building2, Clock, PhoneCall, Ban } from 'lucide-react'
import { getPlanUsage, type PlanUsage } from '@/lib/planUsage'

const PLAN_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  starter:      { color: 'var(--t3)', bg: 'rgba(139,133,160,0.07)', border: 'rgba(139,133,160,0.15)' },
  core:         { color: 'var(--violet)', bg: 'rgba(109,74,255,0.1)',  border: 'rgba(109,74,255,0.2)'  },
  professional: { color: 'var(--rose)', bg: 'rgba(158,123,255,0.1)',  border: 'rgba(158,123,255,0.2)'  },
  enterprise:   { color: 'var(--amber)', bg: 'rgba(217,138,11,0.1)',   border: 'rgba(217,138,11,0.2)'   },
  unlimited:    { color: 'var(--signal)', bg: 'rgba(15,163,122,0.1)',  border: 'rgba(15,163,122,0.2)'   },
}

type ClientBusinessRow = {
  id: string
  name: string
  plan: string
  account_disabled: boolean
  briefing_needs_review: boolean
  vapi_assistant_id: string | null
}

function ClientRow({ biz, usage, email, isLast }: { biz: ClientBusinessRow; usage: PlanUsage; email: string; isLast: boolean }) {
  const s = PLAN_STYLE[biz.plan] ?? PLAN_STYLE.core
  const hasAssistant = !!biz.vapi_assistant_id
  return (
    <div
      className="hover-row flex flex-col gap-2.5 px-4 py-4 md:grid md:items-center md:gap-3 md:px-5 transition-colors"
      style={{
        gridTemplateColumns: '2fr 2fr 1fr 1.2fr 1.3fr 80px',
        borderBottom: isLast ? 'none' : '1px solid var(--b4)',
      }}>
      <Link href={`/admin/clients/${biz.id}`} className="flex items-center gap-2 text-sm font-semibold truncate pr-2 hover:underline" style={{ color: 'var(--text)' }}>
        <span className="truncate">{biz.name}</span>
        {biz.account_disabled && (
          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
            style={{ color: 'var(--coral)', background: 'rgba(221,81,64,0.12)' }}
            title="Access disabled — client cannot log into the dashboard">
            <Ban size={9} /> Disabled
          </span>
        )}
        {biz.briefing_needs_review && (
          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
            style={{ color: 'var(--amber)', background: 'rgba(217,138,11,0.12)' }}
            title="Client updated their Briefing — needs review">
            <Clock size={9} /> Needs review
          </span>
        )}
      </Link>
      <span className="text-xs truncate pr-2" style={{ color: 'var(--t3)' }}>
        {email}
      </span>
      <span className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs px-2.5 py-1 rounded-full font-semibold capitalize"
          style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
          {biz.plan}
        </span>
        {usage.isTrial && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ color: 'var(--violet)', background: 'rgba(109,74,255,0.12)' }}>
            Trial
          </span>
        )}
      </span>
      {usage.isTrial ? (
        <div className="flex flex-col gap-1 pr-2">
          <span className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--violet)' }}>
            <PhoneCall size={10} /> {usage.used} calls (unlimited)
          </span>
          <span className="text-xs" style={{ color: 'var(--t4)' }}>
            {usage.trialDaysLeft != null && usage.trialDaysLeft > 0 ? `${usage.trialDaysLeft}d left` : 'Trial ended'}
          </span>
        </div>
      ) : usage.isUnlimited ? (
        <div className="flex flex-col gap-1 pr-2">
          <span className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--signal)' }}>
            <PhoneCall size={10} /> {usage.used} calls (no cap)
          </span>
          <span className="text-xs" style={{ color: 'var(--t4)' }}>Unlimited plan</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1 pr-2" title={`${usage.used} of ${usage.limit} calls used this cycle`}>
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--t3)' }}>
            <span className="flex items-center gap-1 font-semibold" style={{ color: (usage.pct ?? 0) >= 100 ? 'var(--coral)' : (usage.pct ?? 0) >= 80 ? 'var(--amber)' : 'var(--t2)' }}>
              <PhoneCall size={10} /> {usage.used}/{usage.limit}
            </span>
            <span>{usage.pct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--b4)' }}>
            <div className="h-full rounded-full"
              style={{
                width: `${Math.min(usage.pct ?? 0, 100)}%`,
                background: (usage.pct ?? 0) >= 100 ? 'var(--coral)' : (usage.pct ?? 0) >= 80 ? 'var(--amber)' : 'var(--signal)',
              }} />
          </div>
        </div>
      )}
      <span className="text-xs font-semibold flex items-center gap-1.5"
        style={{ color: hasAssistant ? 'var(--signal)' : 'var(--t5)' }}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: hasAssistant ? 'var(--signal)' : 'var(--t6)' }} />
        {hasAssistant ? 'Connected' : 'Not connected'}
      </span>
      <div className="flex items-center gap-1.5 justify-end">
        <Link href={`/admin/clients/${biz.id}/briefing`}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors btn-ghost shrink-0"
          style={{ color: 'var(--t7)' }}
          title="Company Information">
          <Building2 size={13} />
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
}

export default async function ClientsPage() {
  const admin = createAdminClient()
  const [{ data: businesses }, { data: { users } }] = await Promise.all([
    admin.from('businesses').select('*').order('created_at', { ascending: false }),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const emailMap = Object.fromEntries((users ?? []).map(u => [u.id, u.email ?? '']))
  const list = businesses ?? []

  const usageByBusiness = Object.fromEntries(
    await Promise.all(list.map(async biz => [
      biz.id,
      await getPlanUsage(
        admin, biz.id,
        { plan: biz.plan, planStatus: biz.plan_status, trialStartedAt: biz.trial_started_at, planStartedAt: biz.plan_started_at },
        biz.timezone ?? 'Australia/Adelaide',
      ),
    ]))
  )

  // Group locations sharing one login together — list is already newest-first
  // by created_at, so a group surfaces at the position of its most recently
  // created row. A user_id with exactly one row behaves identically to
  // before this change (rendered via the same ClientRow, no wrapper).
  const groups: { userId: string; rows: typeof list }[] = []
  const groupIndexByUserId = new Map<string, number>()
  for (const biz of list) {
    const idx = groupIndexByUserId.get(biz.user_id)
    if (idx === undefined) {
      groupIndexByUserId.set(biz.user_id, groups.length)
      groups.push({ userId: biz.user_id, rows: [biz] })
    } else {
      groups[idx].rows.push(biz)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
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
              gridTemplateColumns: '2fr 2fr 1fr 1.2fr 1.3fr 80px',
              color: 'var(--t5)',
              borderBottom: '1px solid var(--b3)',
              background: 'var(--b6)',
            }}>
            <span>Business</span>
            <span>Email</span>
            <span>Plan</span>
            <span>Usage</span>
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
            groups.map((group, gi) => {
              const isLastGroup = gi === groups.length - 1
              const email = emailMap[group.userId] ?? '—'

              if (group.rows.length === 1) {
                const biz = group.rows[0]
                return (
                  <ClientRow key={biz.id} biz={biz} usage={usageByBusiness[biz.id]} email={email} isLast={isLastGroup} />
                )
              }

              return (
                <details key={group.userId} open style={{ borderBottom: isLastGroup ? 'none' : '1px solid var(--b4)' }}>
                  <summary className="px-4 py-3 md:px-5 cursor-pointer select-none list-none flex items-center gap-2 text-xs font-bold tracking-wide"
                    style={{ color: 'var(--t4)', background: 'var(--b6)' }}>
                    <span>{email}</span>
                    <span className="px-1.5 py-0.5 rounded-full" style={{ color: 'var(--violet)', background: 'rgba(109,74,255,0.12)' }}>
                      {group.rows.length} locations
                    </span>
                  </summary>
                  {group.rows.map((biz, ri) => (
                    <ClientRow key={biz.id} biz={biz} usage={usageByBusiness[biz.id]} email={email} isLast={ri === group.rows.length - 1} />
                  ))}
                </details>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
