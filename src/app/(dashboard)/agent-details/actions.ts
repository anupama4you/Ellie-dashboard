'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { saveStructuredDraft, type StructuredDraft } from '@/lib/briefing'

export type SectionEdit = { id: string; content: string }

export type AgentDetailsSavePayload = {
  structured: StructuredDraft
  sectionEdits: SectionEdit[]
}

/**
 * Client's Agent Details save path. Stages structured fields in
 * draft_briefing (same mechanism as before) and, separately, writes
 * draft_content on each edited text section — guarded to client_editable
 * rows only, so a tampered request can't stage an edit to an admin-only
 * section. Both are covered by the same briefing_needs_review flag.
 */
export async function saveAgentDetails(businessId: string, payload: AgentDetailsSavePayload): Promise<void> {
  const supabase = await createClient()

  await saveStructuredDraft(supabase, businessId, payload.structured)

  for (const edit of payload.sectionEdits) {
    const { error } = await supabase
      .from('prompt_sections')
      .update({ draft_content: edit.content })
      .eq('id', edit.id)
      .eq('business_id', businessId)
      .eq('client_editable', true)
    if (error) throw new Error(error.message)
  }

  revalidatePath('/agent-details')
  revalidatePath(`/admin/clients/${businessId}/prompt`)
  revalidatePath('/admin/clients')
}
