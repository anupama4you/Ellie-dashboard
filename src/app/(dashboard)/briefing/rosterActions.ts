'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'

/**
 * Per-date staff roster exceptions — deliberately NOT part of BriefingPayload/
 * saveDraftBriefing. Unlike the rest of the Briefing, a roster only matters
 * if it's current (a client saying "I'm off next Tuesday" needs that to take
 * effect immediately, not sit pending admin review), and it's never read by
 * the Vapi system prompt — only by live availability checks — so there's no
 * drift risk the draft/review flow exists to prevent. See PROJECT_CONTEXT.md.
 */

async function assertOwnsStaffMember(staffId: string): Promise<string> {
  const { business } = await getCurrentBusiness()
  if (!business) throw new Error('No business profile found')

  const supabase = await createClient()
  const { data } = await supabase.from('business_staff').select('id').eq('id', staffId).eq('business_id', business.id).single()
  if (!data) throw new Error('Staff member not found')
  return business.id
}

export async function setStaffDateOverride(
  staffId: string,
  date: string,
  override: { isAvailable: boolean; opensAt?: string | null; closesAt?: string | null },
): Promise<void> {
  await assertOwnsStaffMember(staffId)
  const supabase = await createClient()

  const { error } = await supabase.from('business_staff_availability').upsert({
    staff_id: staffId,
    date,
    is_available: override.isAvailable,
    opens_at: override.isAvailable ? (override.opensAt || null) : null,
    closes_at: override.isAvailable ? (override.closesAt || null) : null,
  }, { onConflict: 'staff_id,date' })
  if (error) throw new Error(error.message)

  revalidatePath('/briefing')
}

export async function clearStaffDateOverride(staffId: string, date: string): Promise<void> {
  await assertOwnsStaffMember(staffId)
  const supabase = await createClient()

  const { error } = await supabase.from('business_staff_availability').delete().eq('staff_id', staffId).eq('date', date)
  if (error) throw new Error(error.message)

  revalidatePath('/briefing')
}
