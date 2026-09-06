import type { SupabaseClient } from '@supabase/supabase-js'
import { listPhoneNumbers, resolveOutboundPhoneNumberId, createOutboundCall } from '@/lib/vapi'
import { isWithinOutboundCallingWindow } from '@/lib/outboundWindow'
import { sendEmail } from '@/lib/resend'

type Biz = {
  id: string
  vapi_assistant_id: string | null
  twilio_phone_number: string | null
  user_id: string
  timezone: string
}

type Campaign = {
  id: string
  name: string
  first_message: string
  system_prompt: string
}

/**
 * Places the next `queued` contact's call for a campaign — the one link in
 * the one-call-at-a-time chain. Called both to kick a run off (actions.ts,
 * after the client selects contacts) and to continue it (the
 * end-of-call-report webhook, once the previous call's outcome lands).
 * Never places more than one call; every exit path either queues exactly
 * one more call or turns `running` off with a reason.
 */
export async function placeNextQueuedCall(
  supabase: SupabaseClient,
  biz: Biz,
  campaign: Campaign,
  getNotifyEmail: () => Promise<string | null>,
  // Set for exactly one placement — the call a client just explicitly
  // confirmed via the outside-hours warning at start/resume. Every call
  // after that (chained by the webhook) checks the window again normally,
  // so a run started late in the evening still pauses at the boundary
  // instead of running unattended all night.
  skipWindowCheck = false,
): Promise<void> {
  const { data: next } = await supabase
    .from('outbound_campaign_contacts')
    .select('id, name, phone, note, extra_fields')
    .eq('campaign_id', campaign.id)
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!next) {
    await supabase.from('outbound_campaigns').update({ running: false }).eq('id', campaign.id)
    return
  }

  if (!skipWindowCheck && !isWithinOutboundCallingWindow(new Date(), biz.timezone)) {
    await supabase.from('outbound_campaigns')
      .update({ running: false, stopped_reason: "Paused — outside the 9am–8pm calling window. Resume once you're back in hours." })
      .eq('id', campaign.id)
    return
  }

  try {
    if (!biz.vapi_assistant_id) throw new Error('This location has no Vapi assistant configured.')
    if (!biz.twilio_phone_number) throw new Error('This location has no phone number configured.')

    const phoneNumbers = await listPhoneNumbers()
    const phoneNumberId = resolveOutboundPhoneNumberId(phoneNumbers, biz.twilio_phone_number)
    if (!phoneNumberId) {
      throw new Error(`This location's number (${biz.twilio_phone_number}) isn't imported into Vapi as an outbound-capable number.`)
    }

    const call = await createOutboundCall({
      assistantId: biz.vapi_assistant_id,
      phoneNumberId,
      customerNumber: next.phone,
      firstMessage: campaign.first_message,
      systemPrompt: campaign.system_prompt,
      variableValues: {
        customerName: next.name,
        ...(next.note ? { note: next.note } : {}),
        ...(next.extra_fields as Record<string, string> | null ?? {}),
      },
    })

    const { error } = await supabase.from('outbound_campaign_contacts')
      .update({ status: 'calling', vapi_call_id: call.id })
      .eq('id', next.id)
    if (error) throw new Error(`Placed the call but failed to record it: ${error.message}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error placing the call.'
    console.error(`Outbound campaign ${campaign.id} stopped — failed to place a call for contact ${next.id}:`, err)

    await supabase.from('outbound_campaign_contacts').update({ status: 'failed' }).eq('id', next.id)
    await supabase.from('outbound_campaigns').update({ running: false, stopped_reason: message }).eq('id', campaign.id)

    try {
      const email = await getNotifyEmail()
      if (email) {
        await sendEmail(email, `Outbound campaign "${campaign.name}" stopped`, `
          <p>Ellie hit a problem placing a call and stopped the campaign "${campaign.name}" so no contacts get skipped.</p>
          <p><strong>Reason:</strong> ${message}</p>
          <p>The rest of the contacts are still queued — open the campaign and click Resume once you're ready.</p>
        `)
      }
    } catch (emailErr) {
      console.error('Failed to send campaign-stopped email:', emailErr)
    }
  }
}
