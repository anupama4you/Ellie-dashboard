'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type DayHours = { open: boolean; opensAt: string; closesAt: string }
export type Hours = Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', DayHours>
export type TransferRule = { label: string; description: string; enabled: boolean }
export type ServiceDraft = { id?: string; name: string; durationMinutes: number | null; priceCents: number | null }
export type FaqDraft = { id?: string; question: string; answer: string }

export type BriefingPayload = {
  greetingScript: string
  hours: Hours
  transferRules: TransferRule[]
  services: ServiceDraft[]
  faqs: FaqDraft[]
}

export async function saveBriefing(businessId: string, payload: BriefingPayload) {
  const supabase = await createClient()

  const { error: bizError } = await supabase
    .from('businesses')
    .update({
      greeting_script: payload.greetingScript,
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

  revalidatePath('/briefing')
}
