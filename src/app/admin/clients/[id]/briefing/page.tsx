import { redirect } from 'next/navigation'
import { CheckCircle2, Clock } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminClientHeader from '@/components/AdminClientHeader'
import BriefingReadOnly from '@/components/BriefingReadOnly'
import { dismissBriefingReview } from './actions'
import type { Hours, TransferRule } from '@/app/(dashboard)/briefing/actions'

export default async function AdminBriefingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string }>
}) {
  const { id } = await params
  const { created } = await searchParams
  const admin = createAdminClient()

  const { data: biz } = await admin.from('businesses').select('*').eq('id', id).single()
  if (!biz) redirect('/admin/clients')

  const [{ data: services }, { data: faqs }, { data: { user: clientUser } }] = await Promise.all([
    admin.from('business_services').select('*').eq('business_id', biz.id).order('sort_order'),
    admin.from('business_faqs').select('*').eq('business_id', biz.id).order('sort_order'),
    admin.auth.admin.getUserById(biz.user_id),
  ])

  const dismiss = dismissBriefingReview.bind(null, biz.id)

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-[1220px] mx-auto flex flex-col gap-4">

        <AdminClientHeader
          id={biz.id}
          name={biz.name}
          email={clientUser?.email ?? ''}
          plan={biz.plan}
          hasAssistant={!!biz.vapi_assistant_id}
          active="briefing"
        />

        {created === '1' && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(15,163,122,0.07)', border: '1px solid rgba(15,163,122,0.2)', color: 'var(--signal)' }}>
            <CheckCircle2 size={15} className="shrink-0" />
            <span>
              <b>{biz.name}</b> was created and invited. Head to the System Prompt tab to set up Ellie&apos;s
              initial live behaviour.
            </span>
          </div>
        )}

        {biz.briefing_needs_review && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(217,138,11,0.08)', border: '1px solid rgba(217,138,11,0.25)', color: 'var(--amber)' }}>
            <Clock size={15} className="shrink-0" />
            <span className="flex-1">
              {biz.name} updated this
              {biz.briefing_updated_at && (
                <> on {new Date(biz.briefing_updated_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</>
              )} — not yet reflected in Ellie&apos;s live system prompt.
            </span>
            <form action={dismiss}>
              <button type="submit" className="text-xs font-semibold underline shrink-0" style={{ color: 'var(--amber)' }}>
                Dismiss
              </button>
            </form>
          </div>
        )}

        <p className="text-xs" style={{ color: 'var(--t5)' }}>
          Read-only — this is what the client has entered. Update Ellie&apos;s actual behaviour from the System Prompt tab.
        </p>

        <BriefingReadOnly
          businessName={biz.name}
          greeting={biz.greeting_script ?? ''}
          customInstructions={biz.custom_instructions ?? ''}
          hours={biz.hours as Hours}
          transferRules={biz.transfer_rules as TransferRule[]}
          services={(services ?? []).map(s => ({
            id: s.id, name: s.name, durationMinutes: s.duration_minutes, priceCents: s.price_cents,
          }))}
          faqs={(faqs ?? []).map(f => ({ id: f.id, question: f.question, answer: f.answer }))}
          companyInfo={{
            description: biz.description ?? '',
            website: biz.website ?? '',
            address: biz.address ?? '',
            city: biz.city ?? '',
            state: biz.state ?? '',
            postcode: biz.postcode ?? '',
          }}
        />
      </div>
    </div>
  )
}
