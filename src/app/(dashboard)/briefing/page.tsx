import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { resolveBriefing } from '@/lib/briefing'
import BriefingEditor from '@/components/BriefingEditor'

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

  const resolved = resolveBriefing(biz, services ?? [], faqs ?? [])

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1220px] mx-auto">
        <BriefingEditor
          businessId={biz.id}
          businessName={biz.name}
          initialGreeting={resolved.greetingScript}
          initialCustomInstructions={resolved.customInstructions}
          initialHours={resolved.hours}
          initialTransferRules={resolved.transferRules}
          initialServices={resolved.services}
          initialFaqs={resolved.faqs}
          initialCompanyInfo={resolved.companyInfo}
          isPendingReview={resolved.isDraft}
        />
      </div>
    </div>
  )
}
