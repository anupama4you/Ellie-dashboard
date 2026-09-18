import type { SupabaseClient } from '@supabase/supabase-js'
import { addDaysInZone, startOfBillingCycleInZone, startOfNextBillingCycleInZone } from '@/lib/timezone'

export const TRIAL_DAYS = 7

export type UsageMetric = {
  used: number
  /** null = uncapped (admin hasn't set a cap for this business, or it's on trial). */
  limit: number | null
  /** null whenever limit is null — there's no limit to be a percentage of. */
  pct: number | null
}

function metric(used: number, limit: number | null): UsageMetric {
  if (limit === null) return { used, limit: null, pct: null }
  return { used, limit, pct: Math.min(Math.round((used / limit) * 100), 999) }
}

export type PlanUsage = {
  /** Call minutes, summed from calls.duration_seconds — the natural unit for a voice AI product. */
  minutes: UsageMetric
  /** How many calls made up `minutes.used` — display only, not a capped metric (minutes is the cap unit). */
  callCount: number
  /** Raw SMS messages sent (not Twilio segments/credits). */
  sms: UsageMetric
  /** Trial: when the 7-day trial ends. Otherwise: start of the next monthly billing cycle. */
  renewsAt: Date
  isTrial: boolean
  /** Days left in the trial (can be 0 or negative once it's run out but the admin hasn't converted/cancelled yet). null when not on trial. */
  trialDaysLeft: number | null
}

export type BusinessPlanFields = {
  planStatus: string | null
  trialStartedAt: string | null
  planStartedAt: string | null
  /** Admin-set custom caps (businesses.custom_call_minutes_cap / custom_sms_cap) — null means uncapped. */
  callMinutesCap: number | null
  smsCap: number | null
}

async function sumCallMinutes(supabase: SupabaseClient, businessId: string, since: Date): Promise<{ minutes: number; count: number }> {
  const { data } = await supabase
    .from('calls')
    .select('duration_seconds')
    .eq('business_id', businessId)
    .gte('started_at', since.toISOString())
  const rows = data ?? []
  const totalSeconds = rows.reduce((sum: number, row: { duration_seconds: number | null }) => sum + (row.duration_seconds ?? 0), 0)
  return { minutes: Math.round(totalSeconds / 60), count: rows.length }
}

async function countSms(supabase: SupabaseClient, businessId: string, since: Date): Promise<number> {
  const { count } = await supabase
    .from('sms_log')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .gte('sent_at', since.toISOString())
  return count ?? 0
}

/**
 * Real usage against the business's admin-set custom caps — trial businesses
 * get unlimited-but-counted usage since their trial began; everyone else is
 * counted for the current monthly billing cycle, anchored to `planStartedAt`'s
 * calendar day (not the 1st of the month — a plan that started on the 14th
 * renews on the 14th). Caps are purely for visibility (usage bars, admin
 * alerts), never used to block a call or SMS.
 */
export async function getPlanUsage(
  supabase: SupabaseClient,
  businessId: string,
  fields: BusinessPlanFields,
  timeZone: string,
): Promise<PlanUsage> {
  const now = new Date()

  if (fields.planStatus === 'trial' && fields.trialStartedAt) {
    const trialStart = new Date(fields.trialStartedAt)
    const trialEnd = addDaysInZone(trialStart, TRIAL_DAYS, timeZone)
    const trialDaysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60_000))

    const [{ minutes: minutesUsed, count: callCount }, smsUsed] = await Promise.all([
      sumCallMinutes(supabase, businessId, trialStart),
      countSms(supabase, businessId, trialStart),
    ])

    return {
      minutes: { used: minutesUsed, limit: null, pct: null },
      callCount,
      sms: { used: smsUsed, limit: null, pct: null },
      renewsAt: trialEnd,
      isTrial: true,
      trialDaysLeft,
    }
  }

  const anchor = fields.planStartedAt ? new Date(fields.planStartedAt) : now
  const cycleStart = startOfBillingCycleInZone(anchor, now, timeZone)
  const renewsAt    = startOfNextBillingCycleInZone(anchor, now, timeZone)

  // Cycle boundaries are calendar-day granular (see startOfBillingCycleInZone)
  // so the very first cycle after a trial→paid conversion can otherwise reach
  // back to midnight on the conversion day — sweeping up calls/SMS made
  // earlier that same day while still on the trial's unlimited plan into the
  // brand new paid-plan count. Never count from earlier than the actual
  // anchor instant; every cycle after the first is already later than the
  // anchor, so this is a no-op for them.
  const countFrom = cycleStart.getTime() > anchor.getTime() ? cycleStart : anchor

  const [{ minutes: minutesUsed, count: callCount }, smsUsed] = await Promise.all([
    sumCallMinutes(supabase, businessId, countFrom),
    countSms(supabase, businessId, countFrom),
  ])

  return {
    minutes: metric(minutesUsed, fields.callMinutesCap),
    callCount,
    sms: metric(smsUsed, fields.smsCap),
    renewsAt,
    isTrial: false,
    trialDaysLeft: null,
  }
}

/**
 * Businesses at or above `thresholdPct` on either cap — feeds the admin nav
 * badge and clients-list pills. Trial businesses (no caps yet) never trigger
 * this. One pair of queries per business; fine at this scale, worth a
 * grouped SQL query if the client list ever grows large.
 */
export async function getBusinessesOverUsageThreshold(
  supabase: SupabaseClient,
  thresholdPct = 80,
): Promise<{ id: string; name: string; usage: PlanUsage }[]> {
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, plan_status, trial_started_at, plan_started_at, timezone, custom_call_minutes_cap, custom_sms_cap')
  if (!businesses) return []

  const results = await Promise.all(businesses.map(async b => ({
    id: b.id,
    name: b.name,
    usage: await getPlanUsage(
      supabase,
      b.id,
      {
        planStatus: b.plan_status,
        trialStartedAt: b.trial_started_at,
        planStartedAt: b.plan_started_at,
        callMinutesCap: b.custom_call_minutes_cap,
        smsCap: b.custom_sms_cap,
      },
      b.timezone ?? 'Australia/Adelaide',
    ),
  })))

  return results.filter(r =>
    (r.usage.minutes.pct != null && r.usage.minutes.pct >= thresholdPct) ||
    (r.usage.sms.pct != null && r.usage.sms.pct >= thresholdPct))
}
