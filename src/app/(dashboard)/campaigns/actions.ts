'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { parseContactsCsv } from '@/lib/outboundCsv'
import { isWithinOutboundCallingWindow } from '@/lib/outboundWindow'
import { isFeatureEnabled } from '@/lib/dashboardFeatures'
import { placeNextQueuedCall } from '@/lib/outboundCampaign'

export async function createCampaignAction(formData: FormData): Promise<void> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) redirect('/campaigns?error=nobusiness')
  if (!isFeatureEnabled(biz, 'campaigns')) redirect('/campaigns?error=disabled')

  const nameField = formData.get('name')
  const name = typeof nameField === 'string' ? nameField.trim() : ''

  const firstMessageField = formData.get('firstMessage')
  const firstMessage = typeof firstMessageField === 'string' ? firstMessageField.trim() : ''
  const systemPromptField = formData.get('systemPrompt')
  const systemPrompt = typeof systemPromptField === 'string' ? systemPromptField.trim() : ''
  if (!firstMessage || !systemPrompt) redirect('/campaigns?error=noinstructions')

  if (formData.get('consent') !== 'true') redirect('/campaigns?error=noconsent')

  const file = formData.get('csv')
  if (!(file instanceof File) || file.size === 0) redirect('/campaigns?error=nofile')

  const csvText = await file.text()
  const { valid, skipped } = parseContactsCsv(csvText)
  if (valid.length === 0) redirect('/campaigns?error=novalid')

  const supabase = await createClient()
  const { data: campaign, error: campaignError } = await supabase
    .from('outbound_campaigns')
    .insert({
      business_id: biz.id,
      name: name || 'Untitled campaign',
      first_message: firstMessage,
      system_prompt: systemPrompt,
      status: 'active',
      consent_confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (campaignError || !campaign) redirect('/campaigns?error=create')

  const { error: contactsError } = await supabase.from('outbound_campaign_contacts').insert(
    valid.map(c => ({ campaign_id: campaign.id, name: c.name, phone: c.phone, note: c.note, extra_fields: c.extra })),
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
 * Kicks off a one-call-at-a-time background run for the contacts the client
 * selected: queues them, marks the campaign running, and places the first
 * call. Every call after that is chained by the end-of-call-report webhook
 * (see src/lib/outboundCampaign.ts) — the client doesn't need to stay on
 * this page or click anything again for the rest of the run.
 */
export async function startCallingAction(campaignId: string, contactIds: string[], overrideWindow = false): Promise<void> {
  const { user, business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')
  if (!isFeatureEnabled(biz, 'campaigns')) throw new Error('Campaigns are not enabled for this location.')
  if (!biz.vapi_assistant_id) throw new Error('This location has no Vapi assistant configured.')
  if (!biz.twilio_phone_number) throw new Error('This location has no phone number configured.')
  if (!overrideWindow && !isWithinOutboundCallingWindow(new Date(), biz.timezone)) {
    throw new Error('Outbound calls can only be started between 9am and 8pm.')
  }
  if (contactIds.length === 0) throw new Error('Select at least one contact to call.')

  const supabase = await createClient()

  const { data: campaign } = await supabase
    .from('outbound_campaigns')
    .select('id, name, status, running, first_message, system_prompt')
    .eq('id', campaignId)
    .eq('business_id', biz.id)
    .single()
  if (!campaign) throw new Error('Campaign not found.')
  if (campaign.status !== 'active') throw new Error('Confirm consent before placing calls.')
  if (campaign.running) throw new Error('This campaign is already running.')

  const { data: otherRunning } = await supabase
    .from('outbound_campaigns')
    .select('id, name')
    .eq('business_id', biz.id)
    .eq('running', true)
    .neq('id', campaignId)
    .limit(1)
    .maybeSingle()
  if (otherRunning) throw new Error(`"${otherRunning.name}" is already running — only one campaign can call at a time.`)

  const { data: selected } = await supabase
    .from('outbound_campaign_contacts')
    .select('id')
    .eq('campaign_id', campaignId)
    .in('id', contactIds)
    .in('status', ['pending', 'failed'])
  if (!selected || selected.length === 0) throw new Error('None of the selected contacts are callable.')

  const { error: queueError } = await supabase
    .from('outbound_campaign_contacts')
    .update({ status: 'queued' })
    .in('id', selected.map(c => c.id))
  if (queueError) throw new Error(queueError.message)

  const { error: runError } = await supabase
    .from('outbound_campaigns')
    .update({ running: true, stopped_reason: null })
    .eq('id', campaignId)
  if (runError) throw new Error(runError.message)

  await placeNextQueuedCall(supabase, biz, campaign, async () => user?.email ?? null, overrideWindow)

  revalidatePath(`/campaigns/${campaignId}`)
}

/** Continues an already-queued run after it paused (outside hours, or a
 * system failure the client has looked at) — same one-at-a-time chain,
 * just re-entering it instead of selecting contacts again. */
export async function resumeCallingAction(campaignId: string, overrideWindow = false): Promise<void> {
  const { user, business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')
  if (!isFeatureEnabled(biz, 'campaigns')) throw new Error('Campaigns are not enabled for this location.')
  if (!overrideWindow && !isWithinOutboundCallingWindow(new Date(), biz.timezone)) {
    throw new Error('Outbound calls can only be placed between 9am and 8pm.')
  }

  const supabase = await createClient()

  const { data: campaign } = await supabase
    .from('outbound_campaigns')
    .select('id, name, status, running, first_message, system_prompt')
    .eq('id', campaignId)
    .eq('business_id', biz.id)
    .single()
  if (!campaign) throw new Error('Campaign not found.')
  if (campaign.running) throw new Error('This campaign is already running.')

  const { data: otherRunning } = await supabase
    .from('outbound_campaigns')
    .select('id, name')
    .eq('business_id', biz.id)
    .eq('running', true)
    .neq('id', campaignId)
    .limit(1)
    .maybeSingle()
  if (otherRunning) throw new Error(`"${otherRunning.name}" is already running — only one campaign can call at a time.`)

  const { count: queuedCount } = await supabase
    .from('outbound_campaign_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'queued')
  if (!queuedCount) throw new Error('Nothing queued to resume — select contacts to start a new run.')

  const { error: runError } = await supabase
    .from('outbound_campaigns')
    .update({ running: true, stopped_reason: null })
    .eq('id', campaignId)
  if (runError) throw new Error(runError.message)

  await placeNextQueuedCall(supabase, biz, campaign, async () => user?.email ?? null, overrideWindow)

  revalidatePath(`/campaigns/${campaignId}`)
}
