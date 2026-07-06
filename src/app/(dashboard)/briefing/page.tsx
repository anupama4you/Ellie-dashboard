import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import BriefingEditor from '@/components/BriefingEditor'
import type { Hours, TransferRule } from './actions'

export default async function BriefingPage() {
  const { business: biz } = await getCurrentBusiness()
  const supabase = await createClient()

  if (!biz) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-6 max-w-[1220px] mx-auto">
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>No business profile found.</p>
        </div>
      </div>
    )
  }

  const [{ data: services }, { data: faqs }] = await Promise.all([
    supabase.from('business_services').select('*').eq('business_id', biz.id).order('sort_order'),
    supabase.from('business_faqs').select('*').eq('business_id', biz.id).order('sort_order'),
  ])

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1220px] mx-auto">
        <BriefingEditor
          businessId={biz.id}
          businessName={biz.name}
          vapiAssistantId={biz.vapi_assistant_id}
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
