'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

/** Clears the review flag without touching the live system prompt — for changes that don't need a prompt update. */
export async function dismissBriefingReview(businessId: string) {
  const admin = createAdminClient()
  await admin.from('businesses').update({ briefing_needs_review: false }).eq('id', businessId)
  revalidatePath(`/admin/clients/${businessId}/briefing`)
  revalidatePath('/admin/clients')
}
