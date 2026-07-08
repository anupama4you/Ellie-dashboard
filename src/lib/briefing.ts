import type { SupabaseClient } from '@supabase/supabase-js'
import type { BriefingPayload } from '@/app/(dashboard)/briefing/actions'

/**
 * Client's Briefing write path. Saves the structured fields to Postgres only
 * — it no longer pushes anything to the live Vapi assistant. Flags the
 * business for admin review so a human decides how (and whether) to fold
 * the change into the actual system prompt via the admin System Prompt tab.
 */
export async function applyBriefingWrite(supabase: SupabaseClient, businessId: string, payload: BriefingPayload) {
  const { error: bizError } = await supabase
    .from('businesses')
    .update({
      greeting_script: payload.greetingScript,
      custom_instructions: payload.customInstructions,
      hours: payload.hours,
      transfer_rules: payload.transferRules,
      description: payload.companyInfo.description,
      website: payload.companyInfo.website,
      address: payload.companyInfo.address,
      city: payload.companyInfo.city,
      state: payload.companyInfo.state,
      postcode: payload.companyInfo.postcode,
      google_maps_url: payload.companyInfo.googleMapsUrl,
      briefing_needs_review: true,
      briefing_updated_at: new Date().toISOString(),
    })
    .eq('id', businessId)
  if (bizError) throw new Error(bizError.message)

  const { error: delServicesError } = await supabase
    .from('business_services')
    .delete()
    .eq('business_id', businessId)
  if (delServicesError) throw new Error(delServicesError.message)

  if (payload.services.length > 0) {
    const { error: insServicesError } = await supabase.from('business_services').insert(
      payload.services.map((s, i) => ({
        business_id: businessId,
        name: s.name,
        duration_minutes: s.durationMinutes,
        price_cents: s.priceCents,
        sort_order: i,
      }))
    )
    if (insServicesError) throw new Error(insServicesError.message)
  }

  const { error: delFaqsError } = await supabase
    .from('business_faqs')
    .delete()
    .eq('business_id', businessId)
  if (delFaqsError) throw new Error(delFaqsError.message)

  if (payload.faqs.length > 0) {
    const { error: insFaqsError } = await supabase.from('business_faqs').insert(
      payload.faqs.map((f, i) => ({
        business_id: businessId,
        question: f.question,
        answer: f.answer,
        sort_order: i,
      }))
    )
    if (insFaqsError) throw new Error(insFaqsError.message)
  }
}
