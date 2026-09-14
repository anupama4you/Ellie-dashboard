import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { resolveStructuredData } from '@/lib/briefing'
import { mapSectionRow } from '@/lib/promptSections'
import { isFeatureEnabled } from '@/lib/dashboardFeatures'
import AgentDetailsEditor from '@/components/AgentDetailsEditor'

export default async function AgentDetailsPage() {
  const { business: biz } = await getCurrentBusiness()
  const supabase = await createClient()

  if (!biz) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-3 sm:p-6 max-w-[1220px] mx-auto">
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>No business profile found.</p>
        </div>
      </div>
    )
  }

  const [{ data: services }, { data: staff }, { data: sectionRows }] = await Promise.all([
    supabase.from('business_services').select('*').eq('business_id', biz.id).order('sort_order'),
    supabase.from('business_staff').select('*').eq('business_id', biz.id).order('sort_order'),
    supabase.from('prompt_sections').select('*').eq('business_id', biz.id).eq('client_editable', true).order('sort_order'),
  ])

  const structured = resolveStructuredData(biz, services ?? [], staff ?? [])
  const showStaff = isFeatureEnabled(biz, 'staff')
  const sections = (sectionRows ?? [])
    .map(mapSectionRow)
    .filter(s => showStaff || s.kind !== 'staff_table')

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 sm:p-6 max-w-[1220px] mx-auto">
        <AgentDetailsEditor
          businessId={biz.id}
          businessName={biz.name}
          initialStructured={structured}
          isPendingReview={structured.isDraft}
          sections={sections}
        />
      </div>
    </div>
  )
}
