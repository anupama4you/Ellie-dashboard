'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncAssistantPrompt } from '@/lib/vapi'
import type { BriefingPayload } from '@/app/(dashboard)/briefing/actions'

/** Prompt-only push — for wording tweaks that don't correspond to any pending client draft. Never touches draft_briefing/briefing_needs_review; use applyDraftAndPushPrompt to reconcile a pending draft. */
export async function adminSaveSystemPrompt(
  businessId: string,
  payload: { firstMessage: string; systemPrompt: string },
): Promise<void> {
  const admin = createAdminClient()
  const { data: biz } = await admin.from('businesses').select('vapi_assistant_id').eq('id', businessId).single()
  if (!biz?.vapi_assistant_id) throw new Error('No Vapi assistant connected to this business')

  await syncAssistantPrompt(biz.vapi_assistant_id, payload)

  revalidatePath(`/admin/clients/${businessId}/prompt`)
}

/**
 * Copies the client's pending draft into the live businesses/business_services/
 * business_faqs columns the call-handling webhook reads, then pushes the
 * admin-edited firstMessage/systemPrompt to Vapi — together, so the tools and
 * what Ellie says can never drift apart. Live-data write happens first: if
 * that fails, nothing is pushed and nothing is marked reviewed (safe retry).
 * If the live write succeeds but the Vapi push fails, the draft and review
 * flag are deliberately left in place — that's the same "stale prompt, fresh
 * tools" state this feature exists to make visible and reviewable, rather
 * than a new failure mode, and retrying is a harmless no-op re-apply.
 */
export async function applyDraftAndPushPrompt(
  businessId: string,
  payload: { firstMessage: string; systemPrompt: string },
  expectedBriefingUpdatedAt: string | null,
): Promise<void> {
  const admin = createAdminClient()

  const { data: biz } = await admin
    .from('businesses')
    .select('vapi_assistant_id, draft_briefing, briefing_updated_at')
    .eq('id', businessId)
    .single()

  if (!biz?.vapi_assistant_id) throw new Error('No Vapi assistant connected to this business')
  if (!biz.draft_briefing) throw new Error('No pending client draft to apply')

  // The client may have submitted a newer draft after the admin loaded this
  // page and started hand-authoring the prompt against an older one — don't
  // silently apply data the admin never actually reviewed.
  if (biz.briefing_updated_at !== expectedBriefingUpdatedAt) {
    throw new Error('The client has submitted newer changes since this page loaded — refresh and review before applying.')
  }

  const draft = biz.draft_briefing as BriefingPayload

  const { error: bizError } = await admin.from('businesses').update({
    greeting_script: draft.greetingScript,
    custom_instructions: draft.customInstructions,
    hours: draft.hours,
    transfer_rules: draft.transferRules,
    description: draft.companyInfo.description,
    website: draft.companyInfo.website,
    address: draft.companyInfo.address,
    city: draft.companyInfo.city,
    state: draft.companyInfo.state,
    postcode: draft.companyInfo.postcode,
    google_maps_url: draft.companyInfo.googleMapsUrl,
  }).eq('id', businessId)
  if (bizError) throw new Error(bizError.message)

  const { error: delServicesError } = await admin.from('business_services').delete().eq('business_id', businessId)
  if (delServicesError) throw new Error(delServicesError.message)
  if (draft.services.length > 0) {
    const { error } = await admin.from('business_services').insert(
      draft.services.map((s, i) => ({
        business_id: businessId, name: s.name, duration_minutes: s.durationMinutes, price_cents: s.priceCents, sort_order: i,
      }))
    )
    if (error) throw new Error(error.message)
  }

  const { error: delFaqsError } = await admin.from('business_faqs').delete().eq('business_id', businessId)
  if (delFaqsError) throw new Error(delFaqsError.message)
  if (draft.faqs.length > 0) {
    const { error } = await admin.from('business_faqs').insert(
      draft.faqs.map((f, i) => ({ business_id: businessId, question: f.question, answer: f.answer, sort_order: i }))
    )
    if (error) throw new Error(error.message)
  }

  await syncAssistantPrompt(biz.vapi_assistant_id, payload)

  await admin.from('businesses').update({
    draft_briefing: null,
    briefing_needs_review: false,
  }).eq('id', businessId)

  revalidatePath(`/admin/clients/${businessId}/prompt`)
  revalidatePath(`/admin/clients/${businessId}/briefing`)
  revalidatePath('/admin/clients')
}
