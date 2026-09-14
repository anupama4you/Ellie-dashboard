import { redirect } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { liveStructuredData, resolveStructuredData } from '@/lib/briefing'
import { mapSectionRow } from '@/lib/promptSections'
import AdminClientHeader from '@/components/AdminClientHeader'
import AdminDocumentEditor from '@/components/AdminDocumentEditor'

export default async function AdminPromptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string; emailWarning?: string }>
}) {
  const { id } = await params
  const { created, emailWarning } = await searchParams
  const admin = createAdminClient()

  const { data: biz } = await admin.from('businesses').select('*').eq('id', id).single()
  if (!biz) redirect('/admin/clients')

  const [{ data: services }, { data: staff }, { data: sectionRows }, { data: { user: clientUser } }] = await Promise.all([
    admin.from('business_services').select('*').eq('business_id', biz.id).order('sort_order'),
    admin.from('business_staff').select('*').eq('business_id', biz.id).order('sort_order'),
    admin.from('prompt_sections').select('*').eq('business_id', biz.id).order('sort_order'),
    admin.auth.admin.getUserById(biz.user_id),
  ])

  const liveStructured = liveStructuredData(biz, services ?? [], staff ?? [])
  const draftStructured = resolveStructuredData(biz, services ?? [], staff ?? [])
  const sections = (sectionRows ?? []).map(mapSectionRow)

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-[1220px] mx-auto flex flex-col gap-4">
        <AdminClientHeader id={biz.id} name={biz.name} email={clientUser?.email ?? ''} plan={biz.plan} planStatus={biz.plan_status} hasAssistant={!!biz.vapi_assistant_id} active="prompt" />

        {created === '1' && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(15,163,122,0.07)', border: '1px solid rgba(15,163,122,0.2)', color: 'var(--signal)' }}>
            <b>{biz.name}</b>&nbsp;was created and invited. Add starter sections below, then Apply &amp; Push.
            {emailWarning === '1' && ' (The invite email failed to send — use "Send Password Reset Email" on the Details tab.)'}
          </div>
        )}

        {!biz.vapi_assistant_id && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(221,81,64,0.07)', border: '1px solid rgba(221,81,64,0.2)', color: 'var(--coral)' }}>
            <AlertTriangle size={15} className="shrink-0" /> No Vapi Assistant ID set for this business yet — add one on the Details tab first.
          </div>
        )}

        {biz.vapi_assistant_id && (
          <AdminDocumentEditor
            businessId={biz.id}
            sections={sections}
            liveStructured={liveStructured}
            draftStructured={draftStructured}
            hasDraft={!!biz.draft_briefing}
            expectedBriefingUpdatedAt={biz.briefing_updated_at}
          />
        )}
      </div>
    </div>
  )
}
