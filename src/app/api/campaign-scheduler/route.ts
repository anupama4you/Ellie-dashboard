import { createClient } from '@supabase/supabase-js'
import { isWithinOutboundCallingWindow } from '@/lib/outboundWindow'
import { startCampaignNow } from '@/lib/outboundCampaign'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init)
}

/**
 * Polled every 5 minutes by netlify/functions/campaign-scheduler-tick.mts —
 * the one piece of real scheduled infrastructure in this app, deliberately
 * kept to a single job: find "schedule for later" campaigns whose time has
 * come, and start them exactly the way a client clicking "Send now" would.
 * A campaign blocked by the calling-hours window or another campaign
 * already running for the same business is just left alone — it stays
 * `scheduled_at` in the past and gets picked up on a later poll once the
 * blocker clears, rather than being treated as a failure.
 */
export async function POST(req: Request) {
  const secret = process.env.CAMPAIGN_SCHEDULER_SECRET
  if (secret) {
    if (req.headers.get('x-scheduler-secret') !== secret) {
      return json({ error: 'Unauthorized' }, { status: 401 })
    }
  } else {
    console.warn('CAMPAIGN_SCHEDULER_SECRET is not set — campaign-scheduler is accepting unauthenticated requests.')
  }

  const { data: due, error: dueError } = await supabase
    .from('outbound_campaigns')
    .select('id, name, first_message, system_prompt, business_id, scheduled_at')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', new Date().toISOString())
    .eq('status', 'active')
    .eq('running', false)

  if (dueError) {
    console.error('campaign-scheduler: failed to query due campaigns:', dueError)
    return json({ error: dueError.message }, { status: 500 })
  }

  let started = 0
  let skipped = 0
  let failed = 0

  for (const campaign of due ?? []) {
    try {
      const { data: biz } = await supabase
        .from('businesses')
        .select('id, vapi_assistant_id, twilio_phone_number, user_id, timezone')
        .eq('id', campaign.business_id)
        .single()

      if (!biz) {
        console.error(`campaign-scheduler: no business found for campaign ${campaign.id}`)
        failed++
        continue
      }

      if (!isWithinOutboundCallingWindow(new Date(), biz.timezone)) {
        skipped++
        continue
      }

      const { data: otherRunning } = await supabase
        .from('outbound_campaigns')
        .select('id')
        .eq('business_id', biz.id)
        .eq('running', true)
        .neq('id', campaign.id)
        .limit(1)
        .maybeSingle()
      if (otherRunning) {
        skipped++
        continue
      }

      await startCampaignNow(supabase, biz, campaign, async () => {
        const { data } = await supabase.auth.admin.getUserById(biz.user_id)
        return data.user?.email ?? null
      })
      started++
    } catch (err) {
      console.error(`campaign-scheduler: failed to start campaign ${campaign.id}:`, err)
      failed++
    }
  }

  return json({ ok: true, due: due?.length ?? 0, started, skipped, failed })
}
