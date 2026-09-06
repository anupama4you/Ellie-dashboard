'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { parseContactsCsv } from '@/lib/outboundCsv'
import { listPhoneNumbers, resolveOutboundPhoneNumberId, createOutboundCall } from '@/lib/vapi'
import { isWithinOutboundCallingWindow } from '@/lib/outboundWindow'
import { buildOutboundSystemPrompt, buildOutboundFirstMessage } from '@/lib/outboundPrompt'
import { isFeatureEnabled } from '@/lib/dashboardFeatures'

const BATCH_SIZE = 5

export async function createCampaignAction(formData: FormData): Promise<void> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) redirect('/campaigns?error=nobusiness')
  if (!isFeatureEnabled(biz, 'campaigns')) redirect('/campaigns?error=disabled')

  const nameField = formData.get('name')
  const name = typeof nameField === 'string' ? nameField.trim() : ''

  const instructionsField = formData.get('instructions')
  const instructions = typeof instructionsField === 'string' ? instructionsField.trim() : ''
  if (!instructions) redirect('/campaigns?error=noinstructions')

  const file = formData.get('csv')
  if (!(file instanceof File) || file.size === 0) redirect('/campaigns?error=nofile')

  const csvText = await file.text()
  const { valid, skipped } = parseContactsCsv(csvText)
  if (valid.length === 0) redirect('/campaigns?error=novalid')

  const supabase = await createClient()
  const { data: campaign, error: campaignError } = await supabase
    .from('outbound_campaigns')
    .insert({ business_id: biz.id, name: name || 'Untitled campaign', call_instructions: instructions })
    .select('id')
    .single()
  if (campaignError || !campaign) redirect('/campaigns?error=create')

  const { error: contactsError } = await supabase.from('outbound_campaign_contacts').insert(
    valid.map(c => ({ campaign_id: campaign.id, name: c.name, phone: c.phone, note: c.note })),
  )
  if (contactsError) {
    const { error: cleanupError } = await supabase.from('outbound_campaigns').delete().eq('id', campaign.id)
    if (cleanupError) console.error(`Failed to clean up orphaned campaign ${campaign.id} after a contacts-insert failure:`, cleanupError)
    redirect('/campaigns?error=create')
  }

  revalidatePath('/campaigns')
  redirect(`/campaigns/${campaign.id}${skipped > 0 ? `?skipped=${skipped}` : ''}`)
}

/**
 * The client confirming consent AND submitting for admin review, in one
 * step — status goes to 'pending_review', not straight to 'active'. An
 * admin has to look at call_instructions and approve
 * (see admin/clients/[id]/campaigns/page.tsx) before callNextBatchAction
 * will do anything, the same "client input shouldn't drive live Ellie
 * behavior unreviewed" reasoning as the Briefing draft/live split.
 */
export async function submitForReviewAction(campaignId: string): Promise<void> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')
  if (!isFeatureEnabled(biz, 'campaigns')) throw new Error('Campaigns are not enabled for this location.')

  const supabase = await createClient()
  const { error } = await supabase
    .from('outbound_campaigns')
    .update({ status: 'pending_review', consent_confirmed_at: new Date().toISOString() })
    .eq('id', campaignId)
    .eq('business_id', biz.id)
  if (error) throw new Error(error.message)

  revalidatePath(`/campaigns/${campaignId}`)
}

export async function callNextBatchAction(campaignId: string): Promise<{ placed: number; failed: number }> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')
  if (!isFeatureEnabled(biz, 'campaigns')) throw new Error('Campaigns are not enabled for this location.')
  if (!biz.vapi_assistant_id) throw new Error('This location has no Vapi assistant configured.')
  if (!biz.twilio_phone_number) throw new Error('This location has no phone number configured.')

  if (!isWithinOutboundCallingWindow(new Date(), biz.timezone)) {
    throw new Error('Outbound calls can only be placed between 9am and 8pm.')
  }

  const supabase = await createClient()

  const { data: campaign } = await supabase
    .from('outbound_campaigns')
    .select('id, status, call_instructions')
    .eq('id', campaignId)
    .eq('business_id', biz.id)
    .single()
  if (!campaign) throw new Error('Campaign not found.')
  if (campaign.status !== 'active') {
    throw new Error(
      campaign.status === 'pending_review'
        ? 'Waiting on admin approval of your call instructions before calling can start.'
        : 'Submit this campaign for review before placing calls.',
    )
  }

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

  const systemPrompt = buildOutboundSystemPrompt(biz.name, campaign.call_instructions)

  let placed = 0
  let failed = 0

  for (const contact of pending) {
    try {
      const call = await createOutboundCall({
        assistantId: biz.vapi_assistant_id,
        phoneNumberId,
        customerNumber: contact.phone,
        systemPrompt,
        firstMessage: buildOutboundFirstMessage(biz.name, contact.name),
        variableValues: {
          customerName: contact.name,
          ...(contact.note ? { note: contact.note } : {}),
        },
      })
      const { error: updateError } = await supabase.from('outbound_campaign_contacts')
        .update({ status: 'calling', vapi_call_id: call.id })
        .eq('id', contact.id)
      if (updateError) {
        console.error(`Placed an outbound call for contact ${contact.id} (Vapi call ${call.id}) but failed to record it — this contact may be re-selected on the next batch, risking a duplicate call:`, updateError)
        failed++
      } else {
        placed++
      }
    } catch (err) {
      console.error(`Failed to place outbound call for contact ${contact.id}:`, err)
      failed++
    }
  }

  revalidatePath(`/campaigns/${campaignId}`)
  return { placed, failed }
}
