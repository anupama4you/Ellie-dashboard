import type { SupabaseClient } from '@supabase/supabase-js'
import type { BriefingPayload, Hours, TransferRule } from '@/app/(dashboard)/briefing/actions'

/**
 * Client's Briefing write path. Stages the submitted fields in
 * `draft_briefing` only — never touches the live businesses/business_services/
 * business_faqs columns the call-handling webhook reads. Flags the business
 * for admin review; a human decides whether/how to fold the change into the
 * live tool data + hand-authored system prompt via the admin System Prompt
 * tab's "Apply & Push" action.
 */
export async function saveDraftBriefing(supabase: SupabaseClient, businessId: string, payload: BriefingPayload) {
  const { error } = await supabase
    .from('businesses')
    .update({
      draft_briefing: payload,
      briefing_needs_review: true,
      briefing_updated_at: new Date().toISOString(),
    })
    .eq('id', businessId)
  if (error) throw new Error(error.message)
}

type BizBriefingRow = {
  greeting_script: string | null
  custom_instructions: string | null
  hours: unknown
  transfer_rules: unknown
  transfer_phone_number: string | null
  description: string | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  postcode: string | null
  google_maps_url: string | null
  draft_briefing: unknown
}

type LiveServiceRow = { id: string; name: string; duration_minutes: number | null; price_cents: number | null }
type LiveFaqRow = { id: string; question: string; answer: string }

/** Always the *live* values, ignoring any pending draft — used as the diff baseline. */
export function liveBriefing(biz: BizBriefingRow, liveServices: LiveServiceRow[], liveFaqs: LiveFaqRow[]): BriefingPayload {
  return {
    greetingScript: biz.greeting_script ?? '',
    customInstructions: biz.custom_instructions ?? '',
    hours: biz.hours as Hours,
    transferRules: biz.transfer_rules as TransferRule[],
    transferPhoneNumber: biz.transfer_phone_number ?? '',
    services: liveServices.map(s => ({ id: s.id, name: s.name, durationMinutes: s.duration_minutes, priceCents: s.price_cents })),
    faqs: liveFaqs.map(f => ({ id: f.id, question: f.question, answer: f.answer })),
    companyInfo: {
      description: biz.description ?? '',
      website: biz.website ?? '',
      address: biz.address ?? '',
      city: biz.city ?? '',
      state: biz.state ?? '',
      postcode: biz.postcode ?? '',
      googleMapsUrl: biz.google_maps_url ?? '',
    },
  }
}

/** Draft-preferred: returns the pending client draft if one exists, else falls back to live values. */
export function resolveBriefing(
  biz: BizBriefingRow, liveServices: LiveServiceRow[], liveFaqs: LiveFaqRow[],
): BriefingPayload & { isDraft: boolean } {
  if (biz.draft_briefing) return { ...(biz.draft_briefing as BriefingPayload), isDraft: true }
  return { ...liveBriefing(biz, liveServices, liveFaqs), isDraft: false }
}
