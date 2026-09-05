'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { parseContactsCsv } from '@/lib/outboundCsv'
import { listPhoneNumbers, resolveOutboundPhoneNumberId, createOutboundCall } from '@/lib/vapi'
import { isWithinOutboundCallingWindow } from '@/lib/outboundWindow'

const BATCH_SIZE = 5

export async function createCampaignAction(formData: FormData): Promise<void> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')

  const name = (formData.get('name') as string).trim()
  const file = formData.get('csv') as File
  if (!file || file.size === 0) throw new Error('Choose a CSV file to upload.')

  const csvText = await file.text()
  const { valid, skipped } = parseContactsCsv(csvText)
  if (valid.length === 0) throw new Error('No valid contacts found in that file — check it has name and phone columns.')

  const supabase = await createClient()
  const { data: campaign, error: campaignError } = await supabase
    .from('outbound_campaigns')
    .insert({ business_id: biz.id, name: name || 'Untitled campaign' })
    .select('id')
    .single()
  if (campaignError || !campaign) throw new Error(campaignError?.message ?? 'Failed to create campaign.')

  const { error: contactsError } = await supabase.from('outbound_campaign_contacts').insert(
    valid.map(c => ({ campaign_id: campaign.id, name: c.name, phone: c.phone, note: c.note })),
  )
  if (contactsError) throw new Error(contactsError.message)

  revalidatePath('/campaigns')
  redirect(`/campaigns/${campaign.id}${skipped > 0 ? `?skipped=${skipped}` : ''}`)
}

export async function confirmConsentAction(campaignId: string): Promise<void> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')

  const supabase = await createClient()
  const { error } = await supabase
    .from('outbound_campaigns')
    .update({ status: 'active', consent_confirmed_at: new Date().toISOString() })
    .eq('id', campaignId)
    .eq('business_id', biz.id)
  if (error) throw new Error(error.message)

  revalidatePath(`/campaigns/${campaignId}`)
}

export async function callNextBatchAction(campaignId: string): Promise<{ placed: number; failed: number }> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')
  if (!biz.vapi_assistant_id) throw new Error('This location has no Vapi assistant configured.')
  if (!biz.twilio_phone_number) throw new Error('This location has no phone number configured.')

  if (!isWithinOutboundCallingWindow(new Date(), biz.timezone)) {
    throw new Error('Outbound calls can only be placed between 9am and 8pm.')
  }

  const supabase = await createClient()

  const { data: campaign } = await supabase
    .from('outbound_campaigns')
    .select('id, status')
    .eq('id', campaignId)
    .eq('business_id', biz.id)
    .single()
  if (!campaign) throw new Error('Campaign not found.')
  if (campaign.status !== 'active') throw new Error('Confirm consent before placing calls.')

  const { data: pending } = await supabase
    .from('outbound_campaign_contacts')
    .select('id, name, phone, note')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (!pending || pending.length === 0) {
    revalidatePath(`/campaigns/${campaignId}`)
    return { placed: 0, failed: 0 }
  }

  const phoneNumbers = await listPhoneNumbers()
  const phoneNumberId = resolveOutboundPhoneNumberId(phoneNumbers, biz.twilio_phone_number)
  if (!phoneNumberId) {
    throw new Error(`This location's number (${biz.twilio_phone_number}) isn't imported into Vapi as an outbound-capable number.`)
  }

  let placed = 0
  let failed = 0

  for (const contact of pending) {
    try {
      const call = await createOutboundCall({
        assistantId: biz.vapi_assistant_id,
        phoneNumberId,
        customerNumber: contact.phone,
        variableValues: {
          customerName: contact.name,
          ...(contact.note ? { note: contact.note } : {}),
        },
      })
      await supabase.from('outbound_campaign_contacts')
        .update({ status: 'calling', vapi_call_id: call.id })
        .eq('id', contact.id)
      placed++
    } catch (err) {
      console.error(`Failed to place outbound call for contact ${contact.id}:`, err)
      failed++
    }
  }

  revalidatePath(`/campaigns/${campaignId}`)
  return { placed, failed }
}
