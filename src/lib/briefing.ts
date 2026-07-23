import type { SupabaseClient } from '@supabase/supabase-js'
import type { BriefingPayload, Hours } from '@/app/(dashboard)/briefing/actions'

/**
 * `transferRules` used to be a fixed array of toggleable rules — now it's
 * free text. Old shape can still show up in a live `transfer_rules` column
 * that hasn't been migrated yet, or a client draft saved before this change
 * shipped, so coerce rather than trust the stored type.
 */
function normalizeTransferRules(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .filter((r): r is { label?: string; description?: string; enabled?: boolean } => !!r && typeof r === 'object' && r.enabled)
      .map(r => [r.label, r.description].filter(Boolean).join(': '))
      .join('\n')
  }
  return ''
}

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
    transferRules: normalizeTransferRules(biz.transfer_rules),
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
  if (biz.draft_briefing) {
    const draft = biz.draft_briefing as BriefingPayload
    return { ...draft, transferRules: normalizeTransferRules(draft.transferRules), isDraft: true }
  }
  return { ...liveBriefing(biz, liveServices, liveFaqs), isDraft: false }
}
