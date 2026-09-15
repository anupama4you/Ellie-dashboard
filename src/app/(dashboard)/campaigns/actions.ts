'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { parseContactsCsv, parseManualContact, type ParsedContact } from '@/lib/outboundCsv'
import { isWithinOutboundCallingWindow } from '@/lib/outboundWindow'
import { isFeatureEnabled } from '@/lib/dashboardFeatures'
import { placeNextQueuedCall, startCampaignNow } from '@/lib/outboundCampaign'
import { zonedTimeToUtc } from '@/lib/timezone'

const MAX_SCHEDULE_DAYS_AHEAD = 7

export async function createCampaignAction(formData: FormData): Promise<void> {
  const { user, business: biz } = await getCurrentBusiness()
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

  // "Schedule for later" — parse the client's datetime-local value (naive
  // "YYYY-MM-DDTHH:mm", no timezone) as wall-clock time *in this business's
  // own timezone*, not the server's or the browser's, so 9am means 9am at
  // the salon regardless of where either happens to be.
  const sendOption = formData.get('sendOption') === 'schedule' ? 'schedule' : 'now'
  let scheduledAtUtc: string | null = null
  if (sendOption === 'schedule') {
    const scheduledAtRaw = formData.get('scheduledAt')
    const match = typeof scheduledAtRaw === 'string' ? scheduledAtRaw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/) : null
    if (!match) redirect('/campaigns?error=noschedule')
    const [y, mo, d, h, mi] = [match[1], match[2], match[3], match[4], match[5]].map(Number)
    const scheduledDate = zonedTimeToUtc(biz.timezone, y, mo, d, h, mi)
    if (scheduledDate.getTime() <= Date.now()) redirect('/campaigns?error=schedulepast')
    if (scheduledDate.getTime() > Date.now() + MAX_SCHEDULE_DAYS_AHEAD * 86_400_000) redirect('/campaigns?error=schedulefar')
    scheduledAtUtc = scheduledDate.toISOString()
  }

  // Contacts can come from a CSV, hand-typed rows, or both — combined below.
  // Neither is individually required; only the combined result has to be
  // non-empty.
  const file = formData.get('csv')
  const csvText = file instanceof File && file.size > 0 ? await file.text() : ''
  const { valid: csvValid, skipped } = csvText ? parseContactsCsv(csvText) : { valid: [] as ParsedContact[], skipped: 0 }

  const manualContactsRaw = formData.get('manualContacts')
  let manualContactsInput: { name: string; phone: string; note: string }[] = []
  if (typeof manualContactsRaw === 'string' && manualContactsRaw) {
    try {
      manualContactsInput = JSON.parse(manualContactsRaw)
    } catch {
      manualContactsInput = []
    }
  }
  const manualValid = manualContactsInput
    .map(c => parseManualContact(c.name ?? '', c.phone ?? '', c.note ?? ''))
    .filter((c): c is ParsedContact => c !== null)

  const valid = [...csvValid, ...manualValid]
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
      scheduled_at: scheduledAtUtc,
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

  // "Send now" starts the chain right here; "Schedule for later" leaves
  // contacts pending — the scheduler (api/campaign-scheduler) queues them
  // and starts the chain once scheduled_at comes due.
  let warning: string | null = null
  if (sendOption === 'now') {
    if (!biz.vapi_assistant_id || !biz.twilio_phone_number) {
      warning = 'notconfigured'
    } else {
      const { data: otherRunning } = await supabase
        .from('outbound_campaigns')
        .select('id')
        .eq('business_id', biz.id)
        .eq('running', true)
        .neq('id', campaign.id)
        .limit(1)
        .maybeSingle()
      if (otherRunning) {
        warning = 'anotherrunning'
      } else {
        try {
          await startCampaignNow(
            supabase,
            biz,
            { id: campaign.id, name: name || 'Untitled campaign', first_message: firstMessage, system_prompt: systemPrompt },
            async () => user?.email ?? null,
          )
        } catch (err) {
          console.error(`Failed to start campaign ${campaign.id} immediately after creation:`, err)
          warning = 'startfailed'
        }
      }
    }
  }

  revalidatePath('/campaigns')
  const params = new URLSearchParams()
  if (skipped > 0) params.set('skipped', String(skipped))
  if (warning) params.set('warning', warning)
  const query = params.toString()
  redirect(`/campaigns/${campaign.id}${query ? `?${query}` : ''}`)
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
  // 'completed' is a normal, expected status here now that a finished
  // campaign's contacts can be recalled — it only means every contact had
  // *a* result, not that the campaign can never place another call. Only
  // the legacy pre-consent 'draft' status (never produced by the app
  // anymore, but still a real historical DB value) actually blocks this.
  if (campaign.status === 'draft') throw new Error('Confirm consent before placing calls.')
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
    .in('status', ['pending', 'failed', 'done'])
  if (!selected || selected.length === 0) throw new Error('None of the selected contacts are callable.')

  // Resets outcome/vapi_call_id for anything being re-run (a 'done' contact
  // selected again — a recall) — otherwise the old result would keep
  // showing until the new call actually completes. A no-op for
  // pending/failed contacts, which never had either set.
  const { error: queueError } = await supabase
    .from('outbound_campaign_contacts')
    .update({ status: 'queued', outcome: null, vapi_call_id: null })
    .in('id', selected.map(c => c.id))
  if (queueError) throw new Error(queueError.message)

  // A 'completed' campaign genuinely has more work now (a recall) — flip it
  // back to 'active' along with `running`, or it would sit in this run
  // still labeled "completed" everywhere it's displayed.
  const { error: runError } = await supabase
    .from('outbound_campaigns')
    .update({ running: true, stopped_reason: null, status: 'active' })
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

/**
 * Manually interrupts a running campaign. Only stops the CHAIN — a call
 * already in progress (status 'calling') finishes naturally, since there's
 * no "hang up this call" API call here; end-of-call-report's chaining check
 * (src/app/api/vapi-webhook/route.ts) already reads `running` fresh before
 * placing the next call, so flipping this is sufficient to prevent it.
 * Contacts still `queued` stay queued so Resume can pick the run back up.
 */
export async function stopCampaignAction(campaignId: string): Promise<void> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')
  if (!isFeatureEnabled(biz, 'campaigns')) throw new Error('Campaigns are not enabled for this location.')

  const supabase = await createClient()
  const { data: campaign } = await supabase
    .from('outbound_campaigns')
    .select('id, running')
    .eq('id', campaignId)
    .eq('business_id', biz.id)
    .single()
  if (!campaign) throw new Error('Campaign not found.')
  if (!campaign.running) throw new Error('This campaign is not currently running.')

  const { error } = await supabase
    .from('outbound_campaigns')
    .update({ running: false, stopped_reason: 'Stopped manually.' })
    .eq('id', campaignId)
  if (error) throw new Error(error.message)

  revalidatePath(`/campaigns/${campaignId}`)
}

/**
 * Adds more contacts (CSV and/or manual, same parsing as campaign creation)
 * to an existing campaign — new rows start `pending`, same as any contact
 * would at creation time. Requires re-confirming consent: the campaign's
 * original `consent_confirmed_at` only covered the contacts present when it
 * was created, so this reaffirms it (overwrites the timestamp) rather than
 * silently extending the original consent to people it never covered.
 */
export async function addContactsAction(campaignId: string, formData: FormData): Promise<{ added: number; skipped: number }> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')
  if (!isFeatureEnabled(biz, 'campaigns')) throw new Error('Campaigns are not enabled for this location.')
  if (formData.get('consent') !== 'true') throw new Error('Confirm you have the right to contact these customers.')

  const supabase = await createClient()
  const { data: campaign } = await supabase
    .from('outbound_campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('business_id', biz.id)
    .single()
  if (!campaign) throw new Error('Campaign not found.')

  const file = formData.get('csv')
  const csvText = file instanceof File && file.size > 0 ? await file.text() : ''
  const { valid: csvValid, skipped } = csvText ? parseContactsCsv(csvText) : { valid: [] as ParsedContact[], skipped: 0 }

  const manualContactsRaw = formData.get('manualContacts')
  let manualContactsInput: { name: string; phone: string; note: string }[] = []
  if (typeof manualContactsRaw === 'string' && manualContactsRaw) {
    try {
      manualContactsInput = JSON.parse(manualContactsRaw)
    } catch {
      manualContactsInput = []
    }
  }
  const manualValid = manualContactsInput
    .map(c => parseManualContact(c.name ?? '', c.phone ?? '', c.note ?? ''))
    .filter((c): c is ParsedContact => c !== null)

  const valid = [...csvValid, ...manualValid]
  if (valid.length === 0) throw new Error('No valid contacts to add — check names, phone numbers, and the CSV format.')

  const { error: insertError } = await supabase.from('outbound_campaign_contacts').insert(
    valid.map(c => ({ campaign_id: campaignId, name: c.name, phone: c.phone, note: c.note, extra_fields: c.extra })),
  )
  if (insertError) throw new Error(insertError.message)

  const { error: consentError } = await supabase
    .from('outbound_campaigns')
    .update({ consent_confirmed_at: new Date().toISOString() })
    .eq('id', campaignId)
  if (consentError) console.error('Failed to update consent timestamp after adding contacts:', consentError)

  revalidatePath(`/campaigns/${campaignId}`)
  return { added: valid.length, skipped }
}

/**
 * Edits one contact's name/phone/note. Blocked while the campaign is
 * running (a call chain reading contact rows mid-flight shouldn't race an
 * edit) and for a contact that's already 'calling' or 'queued' for this
 * run — same validation (parseManualContact) as adding one by hand.
 */
export async function updateContactAction(campaignId: string, contactId: string, formData: FormData): Promise<void> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')
  if (!isFeatureEnabled(biz, 'campaigns')) throw new Error('Campaigns are not enabled for this location.')

  const supabase = await createClient()
  const { data: campaign } = await supabase
    .from('outbound_campaigns')
    .select('id, running')
    .eq('id', campaignId)
    .eq('business_id', biz.id)
    .single()
  if (!campaign) throw new Error('Campaign not found.')
  if (campaign.running) throw new Error('Stop the campaign before editing contacts.')

  const { data: contact } = await supabase
    .from('outbound_campaign_contacts')
    .select('id, status')
    .eq('id', contactId)
    .eq('campaign_id', campaignId)
    .single()
  if (!contact) throw new Error('Contact not found.')
  if (contact.status === 'calling' || contact.status === 'queued') throw new Error('This contact is already queued or being called.')

  const name = String(formData.get('name') ?? '')
  const phone = String(formData.get('phone') ?? '')
  const note = String(formData.get('note') ?? '')
  const parsed = parseManualContact(name, phone, note)
  if (!parsed) throw new Error('Enter a valid name and Australian phone number.')

  const { error } = await supabase
    .from('outbound_campaign_contacts')
    .update({ name: parsed.name, phone: parsed.phone, note: parsed.note })
    .eq('id', contactId)
  if (error) throw new Error(error.message)

  revalidatePath(`/campaigns/${campaignId}`)
}

/** Edits the campaign's own name/opening line/behavior. Blocked while
 * running — first_message/system_prompt are read fresh from this row for
 * every call in the chain (not frozen once at creation), so changing them
 * mid-run would silently give some contacts a different script than
 * others. */
export async function updateCampaignAction(campaignId: string, formData: FormData): Promise<void> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')
  if (!isFeatureEnabled(biz, 'campaigns')) throw new Error('Campaigns are not enabled for this location.')

  const supabase = await createClient()
  const { data: campaign } = await supabase
    .from('outbound_campaigns')
    .select('id, running')
    .eq('id', campaignId)
    .eq('business_id', biz.id)
    .single()
  if (!campaign) throw new Error('Campaign not found.')
  if (campaign.running) throw new Error('Stop the campaign before editing its details.')

  const name = String(formData.get('name') ?? '').trim()
  const firstMessage = String(formData.get('firstMessage') ?? '').trim()
  const systemPrompt = String(formData.get('systemPrompt') ?? '').trim()
  if (!firstMessage || !systemPrompt) throw new Error("Opening line and behavior can't be empty.")

  const { error } = await supabase
    .from('outbound_campaigns')
    .update({ name: name || 'Untitled campaign', first_message: firstMessage, system_prompt: systemPrompt })
    .eq('id', campaignId)
  if (error) throw new Error(error.message)

  revalidatePath(`/campaigns/${campaignId}`)
}
