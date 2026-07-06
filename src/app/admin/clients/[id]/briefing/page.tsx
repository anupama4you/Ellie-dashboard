import { redirect } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminClientHeader from '@/components/AdminClientHeader'
import BriefingEditor from '@/components/BriefingEditor'
import { adminSaveBriefing } from './actions'
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
              <b>{biz.name}</b> was created and invited. Business hours and transfer rules already have sensible
              defaults below — fill in the greeting, services, and any FAQs, then save to sync Ellie&apos;s assistant.
            </span>
          </div>
        )}

        <p className="text-xs" style={{ color: 'var(--t5)' }}>
          Changes here save and sync to Vapi the same as the client&apos;s own edits.
        </p>

        <BriefingEditor
          businessId={biz.id}
          businessName={biz.name}
          vapiAssistantId={biz.vapi_assistant_id}
          saveAction={adminSaveBriefing}
          initialGreeting={biz.greeting_script ?? ''}
          initialCustomInstructions={biz.custom_instructions ?? ''}
          initialHours={biz.hours as Hours}
          initialTransferRules={biz.transfer_rules as TransferRule[]}
          initialServices={(services ?? []).map(s => ({
            id: s.id, name: s.name, durationMinutes: s.duration_minutes, priceCents: s.price_cents,
          }))}
          initialFaqs={(faqs ?? []).map(f => ({ id: f.id, question: f.question, answer: f.answer }))}
        />
      </div>
    </div>
  )
}
