'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { saveDraftBriefing } from '@/lib/briefing'

export type DayHours = { open: boolean; opensAt: string; closesAt: string }
export type Hours = Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', DayHours>
export type ServiceDraft = { id?: string; name: string; durationMinutes: number | null; priceCents: number | null }
export type FaqDraft = { id?: string; question: string; answer: string }

export type CompanyInfo = {
  description: string
  website: string
  address: string
  city: string
  state: string
  postcode: string
  googleMapsUrl: string
}

export type BriefingPayload = {
  greetingScript: string
  customInstructions: string
  hours: Hours
  transferRules: string
  transferPhoneNumber: string
  services: ServiceDraft[]
  faqs: FaqDraft[]
  companyInfo: CompanyInfo
}

export async function saveBriefing(businessId: string, payload: BriefingPayload): Promise<void> {
  const supabase = await createClient()
  await saveDraftBriefing(supabase, businessId, payload)
  revalidatePath('/briefing')
  revalidatePath(`/admin/clients/${businessId}/briefing`)
  revalidatePath(`/admin/clients/${businessId}/prompt`)
  revalidatePath('/admin/clients')
}
