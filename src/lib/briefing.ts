import type { SupabaseClient } from '@supabase/supabase-js'
import { syncAssistantPrompt } from '@/lib/vapi'
import { buildAssistantConfig } from '@/lib/assistantPrompt'
import type { BriefingPayload } from '@/app/(dashboard)/briefing/actions'

/**
 * Shared Briefing write path, used by both the client Server Action
 * (RLS-bound client) and the admin Server Action (service-role client).
 * Not itself a Server Action — plain helpers, so a SupabaseClient argument
 * is safe to pass (never crosses the client/server RPC boundary).
 */
export async function applyBriefingWrite(supabase: SupabaseClient, businessId: string, payload: BriefingPayload) {
  const { error: bizError } = await supabase
    .from('businesses')
    .update({
      greeting_script: payload.greetingScript,
      custom_instructions: payload.customInstructions,
      hours: payload.hours,
      transfer_rules: payload.transferRules,
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

/** Pushes the just-saved Briefing content to the business's live Vapi assistant, if one is connected. */
export async function syncBriefingToVapi(supabase: SupabaseClient, businessId: string, payload: BriefingPayload): Promise<string | undefined> {
  const { data: biz } = await supabase
    .from('businesses')
    .select('name, vapi_assistant_id')
    .eq('id', businessId)
    .single()

  if (!biz?.vapi_assistant_id) return undefined

  try {
    const { firstMessage, systemPrompt } = buildAssistantConfig({
      businessName: biz.name,
      greeting: payload.greetingScript,
      customInstructions: payload.customInstructions,
      hours: payload.hours,
      services: payload.services,
      faqs: payload.faqs,
      transferRules: payload.transferRules,
    })
    await syncAssistantPrompt(biz.vapi_assistant_id, { firstMessage, systemPrompt })
    return undefined
  } catch (err) {
    console.error('Failed to sync assistant to Vapi:', err)
    return "Saved, but couldn't update Ellie's live behaviour — check the Vapi assistant connection."
  }
}
