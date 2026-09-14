import type { SupabaseClient } from '@supabase/supabase-js'
import type { Hours, ServiceDraft, StaffDraft } from '@/lib/promptSections'

export type StructuredDraft = {
  greetingScript: string
  hours: Hours
  transferPhoneNumber: string
  services: ServiceDraft[]
  staff: StaffDraft[]
}

/**
 * Client's Agent Details save path for the three structured pieces
 * (hours/services/staff) plus greeting/transfer number. Stages the
 * submitted fields in `draft_briefing` only — never touches the live
 * businesses/business_services columns the call-handling webhook reads.
 * Prose section edits are staged separately, directly on their
 * prompt_sections rows (see agent-details/actions.ts) — both are flagged
 * for admin review via the same briefing_needs_review/briefing_updated_at
 * pair so one Apply & Push promotes everything at once.
 */
export async function saveStructuredDraft(supabase: SupabaseClient, businessId: string, payload: StructuredDraft) {
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

type BizStructuredRow = {
  greeting_script: string | null
  hours: unknown
  transfer_phone_number: string | null
  draft_briefing: unknown
}

type LiveServiceRow = { id: string; name: string; duration_minutes: number | null; price_cents: number | null }
type LiveStaffRow = { id: string; name: string; active: boolean; hours: unknown }

/** Always the *live* values, ignoring any pending draft — used as the diff baseline. */
export function liveStructuredData(
  biz: BizStructuredRow, liveServices: LiveServiceRow[], liveStaff: LiveStaffRow[],
): StructuredDraft {
  return {
    greetingScript: biz.greeting_script ?? '',
    hours: biz.hours as Hours,
    transferPhoneNumber: biz.transfer_phone_number ?? '',
    services: liveServices.map(s => ({ id: s.id, name: s.name, durationMinutes: s.duration_minutes, priceCents: s.price_cents })),
    staff: liveStaff.map(s => ({ id: s.id, name: s.name, active: s.active, hours: s.hours as Hours | null })),
  }
}

/** Draft-preferred: returns the pending client draft if one exists, else falls back to live values. */
export function resolveStructuredData(
  biz: BizStructuredRow, liveServices: LiveServiceRow[], liveStaff: LiveStaffRow[],
): StructuredDraft & { isDraft: boolean } {
  if (biz.draft_briefing) {
    const draft = biz.draft_briefing as StructuredDraft
    return { ...draft, staff: draft.staff ?? [], services: draft.services ?? [], isDraft: true }
  }
  return { ...liveStructuredData(biz, liveServices, liveStaff), isDraft: false }
}
