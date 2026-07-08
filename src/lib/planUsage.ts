import type { SupabaseClient } from '@supabase/supabase-js'
import { startOfMonthInZone, startOfNextMonthInZone } from '@/lib/timezone'

/** Calls included per month, by plan. Single source of truth — used for both display and usage tracking. */
export const PLAN_LIMITS: Record<string, number> = {
  starter: 50, core: 120, professional: 250, enterprise: 500,
}

export function planLimit(plan: string): number {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.core
}

export type PlanUsage = { used: number; limit: number; pct: number; renewsAt: Date }

/**
 * Real count of calls this calendar month (in the business's own timezone)
 * against their plan's included limit. There's no billing/subscription
 * system behind "plan" — it's just a label an admin sets — so "renewsAt" is
 * simply the start of next calendar month, not a real billing anchor. This is
 * purely for visibility (usage bars, admin alerts), never used to block calls.
 */
export async function getPlanUsage(
  supabase: SupabaseClient,
  businessId: string,
  plan: string,
  timeZone: string,
): Promise<PlanUsage> {
  const limit = planLimit(plan)
  const now = new Date()
  const monthStart = startOfMonthInZone(now, timeZone)
  const renewsAt = startOfNextMonthInZone(now, timeZone)

  const { count } = await supabase
    .from('calls')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .gte('started_at', monthStart.toISOString())

  const used = count ?? 0
  return { used, limit, pct: Math.min(Math.round((used / limit) * 100), 999), renewsAt }
}

/**
 * Businesses at or above `thresholdPct` of their plan's monthly call limit —
 * feeds the admin nav badge and clients-list pills. One count query per
 * business; fine at this scale, worth a grouped SQL query if the client list
 * ever grows large.
 */
export async function getBusinessesOverUsageThreshold(
  supabase: SupabaseClient,
  thresholdPct = 80,
): Promise<{ id: string; name: string; plan: string; usage: PlanUsage }[]> {
  const { data: businesses } = await supabase.from('businesses').select('id, name, plan, timezone')
  if (!businesses) return []

  const results = await Promise.all(businesses.map(async b => ({
    id: b.id,
    name: b.name,
    plan: b.plan,
    usage: await getPlanUsage(supabase, b.id, b.plan, b.timezone ?? 'Australia/Adelaide'),
  })))

  return results.filter(r => r.usage.pct >= thresholdPct)
}
