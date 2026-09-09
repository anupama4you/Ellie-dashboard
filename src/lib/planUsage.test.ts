import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPlanUsage, planLimit, PLAN_LIMITS } from './planUsage'

/**
 * Minimal fake covering exactly the one query shape getPlanUsage issues:
 * `.from('calls').select(..., {count:'exact', head:true}).eq('business_id', id).gte('started_at', iso)`.
 * Real Supabase returns `count` alongside `data`/`error` for a `count:'exact'`
 * select — fakeSupabase.ts (used elsewhere in this repo) doesn't model that,
 * so this is a purpose-built stub rather than stretching the shared one.
 */
function fakeSupabaseWithCalls(calls: { business_id: string; started_at: string }[]): SupabaseClient {
  const builder = {
    _bizId: undefined as string | undefined,
    _gte: undefined as string | undefined,
    select() { return builder },
    eq(col: string, val: string) { if (col === 'business_id') builder._bizId = val; return builder },
    gte(col: string, val: string) { if (col === 'started_at') builder._gte = val; return builder },
    then(resolve: (v: { count: number; data: null; error: null }) => unknown) {
      const count = calls.filter(c =>
        c.business_id === builder._bizId && (!builder._gte || c.started_at >= builder._gte),
      ).length
      return Promise.resolve(resolve({ count, data: null, error: null }))
    },
  }
  return { from: () => builder } as unknown as SupabaseClient
}

const TZ = 'Australia/Adelaide'
const BIZ = 'biz-1'

describe('getPlanUsage — trial', () => {
  it('counts only calls since trial_started_at, uncapped', async () => {
    const trialStart = '2026-09-01T00:00:00.000Z'
    const supabase = fakeSupabaseWithCalls([
      { business_id: BIZ, started_at: '2026-08-31T23:00:00.000Z' }, // before trial started — excluded
      { business_id: BIZ, started_at: '2026-09-02T00:00:00.000Z' },
      { business_id: BIZ, started_at: '2026-09-03T00:00:00.000Z' },
      { business_id: 'other-biz', started_at: '2026-09-02T00:00:00.000Z' }, // different business — excluded
    ])

    const usage = await getPlanUsage(supabase, BIZ, {
      plan: 'core', planStatus: 'trial', trialStartedAt: trialStart, planStartedAt: trialStart,
    }, TZ)

    expect(usage.isTrial).toBe(true)
    expect(usage.used).toBe(2)
    expect(usage.limit).toBeNull()
    expect(usage.pct).toBeNull()
  })

  it('trialDaysLeft counts down from TRIAL_DAYS and can go negative once overdue', async () => {
    const supabase = fakeSupabaseWithCalls([])
    const longAgo = new Date(Date.now() - 20 * 24 * 60 * 60_000).toISOString()

    const usage = await getPlanUsage(supabase, BIZ, {
      plan: 'core', planStatus: 'trial', trialStartedAt: longAgo, planStartedAt: longAgo,
    }, TZ)

    expect(usage.trialDaysLeft).toBeLessThan(0)
  })
})

describe('getPlanUsage — paid plan', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('counts calls from the start of the current billing cycle (anchored to plan_started_at\'s day-of-month, not the 1st)', async () => {
    // Anchored on the 9th — "now" is the 20th of the same month, so the
    // current cycle started on the 9th at midnight Adelaide time (+9:30),
    // i.e. 2026-09-08T14:30:00Z.
    vi.setSystemTime(new Date('2026-09-20T00:00:00.000Z'))
    const anchor = '2026-08-09T03:00:00.000Z'
    const supabase = fakeSupabaseWithCalls([
      { business_id: BIZ, started_at: '2026-09-08T10:00:00.000Z' }, // 19:30 the 8th Adelaide — before this cycle — excluded
      { business_id: BIZ, started_at: '2026-09-08T20:00:00.000Z' }, // 05:30 the 9th Adelaide — in this cycle — included
      { business_id: BIZ, started_at: '2026-09-15T00:00:00.000Z' }, // well within the cycle — included
    ])

    const usage = await getPlanUsage(supabase, BIZ, {
      plan: 'core', planStatus: 'active', trialStartedAt: null, planStartedAt: anchor,
    }, TZ)

    expect(usage.used).toBe(2)
    expect(usage.isTrial).toBe(false)
  })

  it('does NOT reach back before the actual conversion instant on the same calendar day as the anchor (trial→paid same-day fix)', async () => {
    // Client was on trial all morning, converts to paid at 15:00 Adelaide the same day.
    vi.setSystemTime(new Date('2026-09-09T07:00:00.000Z')) // 16:30 Adelaide — shortly after conversion
    const planStartedAt = '2026-09-09T05:30:00.000Z' // 15:00 Adelaide (UTC+9:30)
    const supabase = fakeSupabaseWithCalls([
      { business_id: BIZ, started_at: '2026-09-09T01:00:00.000Z' }, // 10:30 Adelaide — trial call, same day, BEFORE conversion
      { business_id: BIZ, started_at: '2026-09-09T06:00:00.000Z' }, // 15:30 Adelaide — first real paid-plan call, AFTER conversion
    ])

    const usage = await getPlanUsage(supabase, BIZ, {
      plan: 'core', planStatus: 'active', trialStartedAt: null, planStartedAt,
    }, TZ)

    // Without the fix this would be 2 (cycleStart falls back to midnight on
    // the 9th, sweeping up the pre-conversion trial call too).
    expect(usage.used).toBe(1)
  })

  it('a cycle that is not the first one is unaffected by the same-day clamp (cycleStart already well after the anchor)', async () => {
    vi.setSystemTime(new Date('2026-11-09T04:00:00.000Z')) // two cycles later
    const anchor = '2026-09-09T05:30:00.000Z'
    const supabase = fakeSupabaseWithCalls([
      { business_id: BIZ, started_at: '2026-11-08T10:00:00.000Z' }, // 19:30 the 8th Adelaide — before this cycle's start — excluded
      { business_id: BIZ, started_at: '2026-11-08T20:00:00.000Z' }, // 05:30 the 9th Adelaide — this cycle — included
    ])

    const usage = await getPlanUsage(supabase, BIZ, {
      plan: 'core', planStatus: 'active', trialStartedAt: null, planStartedAt: anchor,
    }, TZ)

    expect(usage.used).toBe(1)
  })

  it('unlimited plan has no limit/pct even though it still counts calls', async () => {
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'))
    const anchor = '2026-09-01T00:00:00.000Z'
    const supabase = fakeSupabaseWithCalls([{ business_id: BIZ, started_at: '2026-09-02T00:00:00.000Z' }])

    const usage = await getPlanUsage(supabase, BIZ, {
      plan: 'unlimited', planStatus: 'active', trialStartedAt: null, planStartedAt: anchor,
    }, TZ)

    expect(usage.isUnlimited).toBe(true)
    expect(usage.limit).toBeNull()
    expect(usage.pct).toBeNull()
    expect(usage.used).toBe(1)
  })

  it('pct is capped at 999 for wildly over-limit usage', async () => {
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'))
    const anchor = '2026-09-01T00:00:00.000Z'
    const calls = Array.from({ length: 5000 }, (_, i) => ({ business_id: BIZ, started_at: `2026-09-0${1 + (i % 8)}T00:00:00.000Z` }))
    const supabase = fakeSupabaseWithCalls(calls)

    const usage = await getPlanUsage(supabase, BIZ, {
      plan: 'starter', planStatus: 'active', trialStartedAt: null, planStartedAt: anchor,
    }, TZ)

    expect(usage.pct).toBe(999)
  })
})

describe('planLimit', () => {
  it('returns the configured limit for a known plan', () => {
    expect(planLimit('professional')).toBe(PLAN_LIMITS.professional)
  })

  it('returns null (uncapped) for the unlimited plan specifically, not as "unrecognized"', () => {
    expect(planLimit('unlimited')).toBeNull()
  })

  it('falls back to core for an unrecognized plan string', () => {
    expect(planLimit('some-old-deleted-plan')).toBe(PLAN_LIMITS.core)
  })
})
