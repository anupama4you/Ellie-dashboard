import { redirect } from 'next/navigation'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAssistant } from '@/lib/vapi'
import { defaultGreeting } from '@/lib/assistantPrompt'
import { resolveBriefing } from '@/lib/briefing'
import AdminClientHeader from '@/components/AdminClientHeader'
import SystemPromptEditor from '@/components/SystemPromptEditor'

export default async function AdminSystemPromptPage({
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

  const resolved = resolveBriefing(biz, services ?? [], faqs ?? [])
  const hasDraft = !!biz.draft_briefing

  const briefing = {
    greeting: resolved.greetingScript,
    customInstructions: resolved.customInstructions,
    hours: resolved.hours,
    transferRules: resolved.transferRules,
    services: resolved.services,
    faqs: resolved.faqs,
    companyInfo: resolved.companyInfo,
  }

  let initialFirstMessage = defaultGreeting(biz.name)
  let initialSystemPrompt = ''
  let loadError = false

  if (biz.vapi_assistant_id) {
    try {
      const assistant = await getAssistant(biz.vapi_assistant_id)
      initialFirstMessage = assistant.firstMessage ?? initialFirstMessage
      initialSystemPrompt = assistant.model?.messages?.find(m => m.role === 'system')?.content ?? ''
    } catch (err) {
      console.error('Failed to load live assistant config:', err)
      loadError = true
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-[1220px] mx-auto flex flex-col gap-4">

        <AdminClientHeader
          id={biz.id}
          name={biz.name}
          email={clientUser?.email ?? ''}
          plan={biz.plan}
          hasAssistant={!!biz.vapi_assistant_id}
          active="prompt"
        />

        {created === '1' && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(15,163,122,0.07)', border: '1px solid rgba(15,163,122,0.2)', color: 'var(--signal)' }}>
            <CheckCircle2 size={15} className="shrink-0" />
            <span>
              <b>{biz.name}</b> was created and invited. Hit &quot;Regenerate from Briefing&quot; below for a starting
              point, then save to push it live.
            </span>
          </div>
        )}

        {!biz.vapi_assistant_id && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(221,81,64,0.07)', border: '1px solid rgba(221,81,64,0.2)', color: 'var(--coral)' }}>
            <AlertTriangle size={15} className="shrink-0" />
            No Vapi Assistant ID set for this business yet — add one on the Details tab first.
          </div>
        )}

        {loadError && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(221,81,64,0.07)', border: '1px solid rgba(221,81,64,0.2)', color: 'var(--coral)' }}>
            <AlertTriangle size={15} className="shrink-0" />
            Couldn&apos;t load the live assistant config from Vapi — check the assistant ID and try again.
          </div>
        )}

        {biz.vapi_assistant_id && !loadError && (
          <SystemPromptEditor
            businessId={biz.id}
            businessName={biz.name}
            initialFirstMessage={initialFirstMessage}
            initialSystemPrompt={initialSystemPrompt}
            briefing={briefing}
            hasDraft={hasDraft}
            expectedBriefingUpdatedAt={biz.briefing_updated_at}
          />
        )}
      </div>
    </div>
  )
}
