'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BriefingPayload, CompanyInfo } from '@/app/(dashboard)/briefing/actions'

/** Discards the client's pending draft without touching live data — for changes the admin decides not to apply. Live businesses/business_services/business_faqs columns are left exactly as they are. */
export async function rejectDraftBriefing(businessId: string) {
  const admin = createAdminClient()
  await admin.from('businesses').update({ draft_briefing: null, briefing_needs_review: false }).eq('id', businessId)
  revalidatePath(`/admin/clients/${businessId}/briefing`)
  revalidatePath(`/admin/clients/${businessId}/prompt`)
  revalidatePath('/admin/clients')
}

/**
 * Lets the admin correct just the Company Information part of a pending
 * client draft (typos, a bad Google Maps link, etc.) without accepting or
 * rejecting the rest of the submission wholesale. Still only touches
 * draft_briefing — live data changes only via the Prompt tab's Apply & Push,
 * which re-reads the draft fresh, so this correction flows through the same
 * atomic path as everything else.
 */
export async function updateDraftCompanyInfo(businessId: string, companyInfo: CompanyInfo) {
  const admin = createAdminClient()
  const { data: biz } = await admin.from('businesses').select('draft_briefing').eq('id', businessId).single()
  if (!biz?.draft_briefing) throw new Error('No pending draft to correct')

  const draft = biz.draft_briefing as BriefingPayload
  const { error } = await admin
    .from('businesses')
    .update({ draft_briefing: { ...draft, companyInfo }, briefing_updated_at: new Date().toISOString() })
    .eq('id', businessId)
  if (error) throw new Error(error.message)

  revalidatePath(`/admin/clients/${businessId}/briefing`)
  revalidatePath(`/admin/clients/${businessId}/prompt`)
}

/**
 * Lets the admin set/edit Company Information directly when there's no
 * pending client draft to correct — e.g. initial setup for a new client, or
 * a standalone fix outside of any Briefing submission. Writes straight to
 * the live businesses columns (no review step needed, since there's no
 * in-flight client change this could clobber). Note this does NOT touch the
 * system prompt text — re-run "Regenerate from Briefing" + Apply & Push on
 * the Prompt tab afterwards if the prompt's <!-- briefing:companyInfo -->
 * section needs to reflect the update.
 */
export async function updateLiveCompanyInfo(businessId: string, companyInfo: CompanyInfo) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('businesses')
    .update({
      description: companyInfo.description,
      website: companyInfo.website,
      address: companyInfo.address,
      city: companyInfo.city,
      state: companyInfo.state,
      postcode: companyInfo.postcode,
      google_maps_url: companyInfo.googleMapsUrl,
    })
    .eq('id', businessId)
  if (error) throw new Error(error.message)

  revalidatePath(`/admin/clients/${businessId}/briefing`)
  revalidatePath(`/admin/clients/${businessId}/prompt`)
}
