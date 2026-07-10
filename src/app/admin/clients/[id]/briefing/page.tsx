import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2, Clock } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveBriefing, liveBriefing } from '@/lib/briefing'
import AdminClientHeader from '@/components/AdminClientHeader'
import BriefingReadOnly from '@/components/BriefingReadOnly'
import AdminCompanyInfoEditor from '@/components/AdminCompanyInfoEditor'
import { rejectDraftBriefing } from './actions'

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

  const reject = rejectDraftBriefing.bind(null, biz.id)
  const hasDraft = !!biz.draft_briefing
  const draft = resolveBriefing(biz, services ?? [], faqs ?? [])
  const live = liveBriefing(biz, services ?? [], faqs ?? [])

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-[1220px] mx-auto flex flex-col gap-4">

        <AdminClientHeader
          id={biz.id}
          name={biz.name}
          email={clientUser?.email ?? ''}
          plan={biz.plan}
          planStatus={biz.plan_status}
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
              {biz.name} submitted changes
              {biz.briefing_updated_at && (
                <> on {new Date(biz.briefing_updated_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</>
              )} — not yet applied to Ellie&apos;s live behaviour or system prompt.
            </span>
            <Link href={`/admin/clients/${biz.id}/prompt`} className="text-xs font-semibold shrink-0" style={{ color: 'var(--amber)' }}>
              Review &amp; Apply →
            </Link>
            <form action={reject}>
              <button type="submit" className="text-xs font-semibold underline shrink-0" style={{ color: 'var(--coral)' }}
                title="Discards these pending changes. Live data and the system prompt are left untouched.">
                Reject changes
              </button>
            </form>
          </div>
        )}

        <p className="text-xs" style={{ color: 'var(--t5)' }}>
          Read-only — this is what the client has entered. Update Ellie&apos;s actual behaviour from the System Prompt tab.
        </p>

        <BriefingReadOnly
          businessName={biz.name}
          hasDraft={hasDraft}
          draft={draft}
          live={live}
          companyInfoSlot={
            <AdminCompanyInfoEditor
              businessId={biz.id}
              hasDraft={hasDraft}
              draftCompanyInfo={draft.companyInfo}
              liveCompanyInfo={live.companyInfo}
            />
          }
        />
      </div>
    </div>
  )
}
