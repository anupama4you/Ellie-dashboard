import { createClient } from '@/lib/supabase/server'
import BriefingEditor from '@/components/BriefingEditor'
import type { Hours, TransferRule } from './actions'

export default async function BriefingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: biz } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', user?.id)
    .single()

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
          initialGreeting={biz.greeting_script ?? ''}
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
