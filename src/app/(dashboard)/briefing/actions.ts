'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { applyBriefingWrite } from '@/lib/briefing'

export type DayHours = { open: boolean; opensAt: string; closesAt: string }
export type Hours = Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', DayHours>
export type TransferRule = { label: string; description: string; enabled: boolean }
export type ServiceDraft = { id?: string; name: string; durationMinutes: number | null; priceCents: number | null }
export type FaqDraft = { id?: string; question: string; answer: string }

export type CompanyInfo = {
  description: string
  website: string
  address: string
  city: string
  state: string
  postcode: string
}

export type BriefingPayload = {
  greetingScript: string
  customInstructions: string
  hours: Hours
  transferRules: TransferRule[]
  services: ServiceDraft[]
  faqs: FaqDraft[]
  companyInfo: CompanyInfo
}

export async function saveBriefing(businessId: string, payload: BriefingPayload): Promise<void> {
  const supabase = await createClient()
  await applyBriefingWrite(supabase, businessId, payload)
  revalidatePath('/briefing')
}
