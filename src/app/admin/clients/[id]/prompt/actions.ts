'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncAssistantPrompt } from '@/lib/vapi'

export async function adminSaveSystemPrompt(
  businessId: string,
  payload: { firstMessage: string; systemPrompt: string },
): Promise<void> {
  const admin = createAdminClient()
  const { data: biz } = await admin.from('businesses').select('vapi_assistant_id').eq('id', businessId).single()
  if (!biz?.vapi_assistant_id) throw new Error('No Vapi assistant connected to this business')

  await syncAssistantPrompt(biz.vapi_assistant_id, payload)

  await admin.from('businesses').update({ briefing_needs_review: false }).eq('id', businessId)
  revalidatePath(`/admin/clients/${businessId}/prompt`)
  revalidatePath(`/admin/clients/${businessId}/briefing`)
  revalidatePath('/admin/clients')
}
