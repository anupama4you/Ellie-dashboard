import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { PhoneCall, MessageSquare, Wallet } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAssistantCallCost } from '@/lib/vapi'
import { getSmsCost } from '@/lib/sms'
import { startOfBillingCycleInZone } from '@/lib/timezone'
import { TRIAL_DAYS } from '@/lib/planUsage'
import AdminClientHeader from '@/components/AdminClientHeader'

function CostCard({ icon: Icon, title, children }: { icon: typeof PhoneCall; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
      <div className="px-5 py-4 flex items-center gap-2.5" style={{ borderBottom: '1px solid var(--b3)' }}>
        <Icon size={15} style={{ color: 'var(--t3)' }} />
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
      </div>
      <div className="p-5 flex flex-col gap-2">{children}</div>
    </div>
  )
}

function fmtUsd(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

export default async function AdminClientCostsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: biz } = await admin.from('businesses').select('*').eq('id', id).single()
  if (!biz) redirect('/admin/clients')

  const { data: { user: clientUser } } = await admin.auth.admin.getUserById(biz.user_id)

  const timeZone = biz.timezone ?? 'Australia/Adelaide'
  const now = new Date()

  // Same window definition as getPlanUsage (lib/planUsage.ts) — trial counts
  // since trial_started_at, everyone else since their billing-cycle anchor
  // day (plan_started_at), not the 1st of the calendar month. Kept consistent
  // so "cost this period" always lines up with "usage this period" shown
  // elsewhere for the same business.
  const periodStart = biz.plan_status === 'trial' && biz.trial_started_at
    ? new Date(biz.trial_started_at)
    : startOfBillingCycleInZone(new Date(biz.plan_started_at ?? biz.created_at), now, timeZone)

  const [vapiCost, smsCost] = await Promise.all([
    biz.vapi_assistant_id
      ? getAssistantCallCost(biz.vapi_assistant_id, periodStart.toISOString(), now.toISOString()).catch(() => null)
      : Promise.resolve(null),
    biz.twilio_phone_number
      ? getSmsCost(biz.twilio_phone_number, periodStart).catch(() => null)
      : Promise.resolve(null),
  ])

  const combinedTotal = (vapiCost?.totalCost ?? 0) + (smsCost?.totalCost ?? 0)

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-5">

        <AdminClientHeader
          id={biz.id}
          name={biz.name}
          email={clientUser?.email ?? ''}
          plan={biz.plan}
          planStatus={biz.plan_status}
          hasAssistant={!!biz.vapi_assistant_id}
          active="costs"
        />

        <p className="text-xs leading-relaxed" style={{ color: 'var(--t5)' }}>
          Real provider spend for this client since{' '}
          {biz.plan_status === 'trial' ? `their trial started (${TRIAL_DAYS}-day trial)` : 'the start of their current billing cycle'} —
          pulled live from Vapi and Twilio, not estimated. Doesn&apos;t include the fixed monthly cost of the Twilio number itself,
          Stripe processing fees, or shared infrastructure/hosting — none of those are meaningfully attributable to one client.
        </p>

        <div className="rounded-2xl px-5 py-4 flex items-center gap-3"
          style={{ background: 'rgba(109,74,255,0.06)', border: '1px solid rgba(109,74,255,0.18)' }}>
          <Wallet size={18} style={{ color: 'var(--violet)' }} />
          <div>
            <div className="text-2xl font-bold" style={{ color: 'var(--violet)' }}>{fmtUsd(combinedTotal)}</div>
            <div className="text-xs" style={{ color: 'var(--t5)' }}>Combined Vapi + Twilio cost this period</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

          <CostCard icon={PhoneCall} title="Vapi (calls)">
            {!biz.vapi_assistant_id ? (
              <p className="text-xs" style={{ color: 'var(--t5)' }}>No assistant configured.</p>
            ) : vapiCost === null ? (
              <p className="text-xs" style={{ color: 'var(--coral)' }}>Couldn&apos;t load live cost data from Vapi — try again shortly.</p>
            ) : (
              <>
                <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{fmtUsd(vapiCost.totalCost)}</div>
                <p className="text-xs" style={{ color: 'var(--t5)' }}>{vapiCost.callCount} call{vapiCost.callCount !== 1 ? 's' : ''} this period</p>
              </>
            )}
          </CostCard>

          <CostCard icon={MessageSquare} title="Twilio (SMS)">
            {!biz.twilio_phone_number ? (
              <p className="text-xs" style={{ color: 'var(--t5)' }}>No Twilio number configured.</p>
            ) : smsCost === null ? (
              <p className="text-xs" style={{ color: 'var(--coral)' }}>Couldn&apos;t load live cost data from Twilio — try again shortly.</p>
            ) : (
              <>
                <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{fmtUsd(smsCost.totalCost, smsCost.currency)}</div>
                <p className="text-xs" style={{ color: 'var(--t5)' }}>{smsCost.messageCount} message{smsCost.messageCount !== 1 ? 's' : ''} this period</p>
              </>
            )}
          </CostCard>

        </div>
      </div>
    </div>
  )
}
