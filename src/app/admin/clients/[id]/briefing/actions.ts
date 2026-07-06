'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyBriefingWrite, syncBriefingToVapi } from '@/lib/briefing'
import type { BriefingPayload } from '@/app/(dashboard)/briefing/actions'

export async function adminSaveBriefing(businessId: string, payload: BriefingPayload): Promise<{ warning?: string }> {
  const admin = createAdminClient()
  await applyBriefingWrite(admin, businessId, payload)
  const warning = await syncBriefingToVapi(admin, businessId, payload)
  revalidatePath(`/admin/clients/${businessId}/briefing`)
  return { warning }
}
