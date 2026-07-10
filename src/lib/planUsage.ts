import type { SupabaseClient } from '@supabase/supabase-js'
import { addDaysInZone, startOfBillingCycleInZone, startOfNextBillingCycleInZone } from '@/lib/timezone'

/** Calls included per month, by plan. Single source of truth — used for both display and usage tracking. */
export const PLAN_LIMITS: Record<string, number> = {
  starter: 50, core: 120, professional: 250, enterprise: 500,
}

export const TRIAL_DAYS = 7

export function planLimit(plan: string): number {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.core
}

export type PlanUsage = {
  used: number
  /** null while on trial — unlimited calls, no plan limit applies yet. */
  limit: number | null
  /** null while on trial — there's no limit to be a percentage of. */
  pct: number | null
  /** Trial: when the 7-day trial ends. Otherwise: start of the next monthly billing cycle. */
  renewsAt: Date
  isTrial: boolean
  /** Days left in the trial (can be 0 or negative once it's run out but the admin hasn't converted/cancelled yet). null when not on trial. */
  trialDaysLeft: number | null
}

export type BusinessPlanFields = {
  plan: string
  planStatus: string | null
  trialStartedAt: string | null
  planStartedAt: string | null
}

/**
 * Real count of calls against the business's plan — trial businesses get an
 * unlimited-but-counted total since their trial began; everyone else is
 * counted against their plan's included limit for the current monthly
 * billing cycle, anchored to `planStartedAt`'s calendar day (not the 1st of
 * the month — a plan that started on the 14th renews on the 14th). There's
 * no billing/subscription system behind "plan" — it's just a label an admin
 * sets — so this is purely for visibility (usage bars, admin alerts), never
 * used to block calls.
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

    const { count } = await supabase
      .from('calls')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('started_at', trialStart.toISOString())

    const trialDaysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60_000))
    return { used: count ?? 0, limit: null, pct: null, renewsAt: trialEnd, isTrial: true, trialDaysLeft }
  }

  const limit  = planLimit(fields.plan)
  const anchor = fields.planStartedAt ? new Date(fields.planStartedAt) : now
  const cycleStart = startOfBillingCycleInZone(anchor, now, timeZone)
  const renewsAt    = startOfNextBillingCycleInZone(anchor, now, timeZone)

  const { count } = await supabase
    .from('calls')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .gte('started_at', cycleStart.toISOString())

  const used = count ?? 0
  return {
    used,
    limit,
    pct: Math.min(Math.round((used / limit) * 100), 999),
    renewsAt,
    isTrial: false,
    trialDaysLeft: null,
  }
}

/**
 * Businesses at or above `thresholdPct` of their plan's monthly call limit —
 * feeds the admin nav badge and clients-list pills. Trial businesses (no
 * limit yet) never trigger this. One count query per business; fine at this
 * scale, worth a grouped SQL query if the client list ever grows large.
 */
export async function getBusinessesOverUsageThreshold(
  supabase: SupabaseClient,
  thresholdPct = 80,
): Promise<{ id: string; name: string; plan: string; usage: PlanUsage }[]> {
  const { data: businesses } = await supabase.from('businesses').select('id, name, plan, plan_status, trial_started_at, plan_started_at, timezone')
  if (!businesses) return []

  const results = await Promise.all(businesses.map(async b => ({
    id: b.id,
    name: b.name,
    plan: b.plan,
    usage: await getPlanUsage(
      supabase,
      b.id,
      { plan: b.plan, planStatus: b.plan_status, trialStartedAt: b.trial_started_at, planStartedAt: b.plan_started_at },
      b.timezone ?? 'Australia/Adelaide',
    ),
  })))

  return results.filter(r => r.usage.pct != null && r.usage.pct >= thresholdPct)
}
