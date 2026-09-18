import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPlanUsage } from './planUsage'

type CallRow = { business_id: string; started_at: string; duration_seconds: number }
type SmsRow = { business_id: string; sent_at: string }

/**
 * Minimal fake covering exactly the two query shapes getPlanUsage issues:
 * `.from('calls').select('duration_seconds').eq('business_id', id).gte('started_at', iso)`
 * (rows, summed in JS) and
 * `.from('sms_log').select(..., {count:'exact', head:true}).eq('business_id', id).gte('sent_at', iso)`
 * (count). Real Supabase returns `count` alongside `data`/`error` for a
 * `count:'exact'` select — fakeSupabase.ts (used elsewhere in this repo)
 * doesn't model that, so this is a purpose-built stub rather than stretching
 * the shared one.
 */
function fakeSupabase(calls: CallRow[], sms: SmsRow[] = []): SupabaseClient {
  function tableBuilder<T extends { business_id: string }>(rows: T[], dateCol: keyof T, mode: 'rows' | 'count') {
    const builder = {
      _bizId: undefined as string | undefined,
      _gte: undefined as string | undefined,
      select() { return builder },
      eq(col: string, val: string) { if (col === 'business_id') builder._bizId = val; return builder },
      gte(col: string, val: string) { if (col === dateCol) builder._gte = val; return builder },
      then(resolve: (v: { count: number; data: T[] | null; error: null }) => unknown) {
        const matched = rows.filter(r =>
          r.business_id === builder._bizId && (!builder._gte || (r[dateCol] as string) >= builder._gte!))
        return Promise.resolve(resolve({ count: matched.length, data: mode === 'rows' ? matched : null, error: null }))
      },
    }
    return builder
  }

  return {
    from: (table: string) => {
      if (table === 'calls') return tableBuilder(calls, 'started_at', 'rows')
      if (table === 'sms_log') return tableBuilder(sms, 'sent_at', 'count')
      throw new Error(`fakeSupabase: unexpected table "${table}"`)
    },
  } as unknown as SupabaseClient
}

const TZ = 'Australia/Adelaide'
const BIZ = 'biz-1'

describe('getPlanUsage — trial', () => {
  it('sums call minutes and counts SMS only since trial_started_at, uncapped', async () => {
    const trialStart = '2026-09-01T00:00:00.000Z'
    const supabase = fakeSupabase([
      { business_id: BIZ, started_at: '2026-08-31T23:00:00.000Z', duration_seconds: 600 }, // before trial started — excluded
      { business_id: BIZ, started_at: '2026-09-02T00:00:00.000Z', duration_seconds: 120 },
      { business_id: BIZ, started_at: '2026-09-03T00:00:00.000Z', duration_seconds: 180 },
      { business_id: 'other-biz', started_at: '2026-09-02T00:00:00.000Z', duration_seconds: 999 }, // different business — excluded
    ], [
      { business_id: BIZ, sent_at: '2026-08-31T23:00:00.000Z' }, // before trial started — excluded
      { business_id: BIZ, sent_at: '2026-09-02T00:00:00.000Z' },
    ])

    const usage = await getPlanUsage(supabase, BIZ, {
      planStatus: 'trial', trialStartedAt: trialStart, planStartedAt: trialStart, callMinutesCap: 500, smsCap: 100,
    }, TZ)

    expect(usage.isTrial).toBe(true)
    expect(usage.minutes.used).toBe(5) // (120 + 180) / 60
    expect(usage.minutes.limit).toBeNull() // caps are ignored during trial — unlimited but counted
    expect(usage.minutes.pct).toBeNull()
    expect(usage.callCount).toBe(2)
    expect(usage.sms.used).toBe(1)
    expect(usage.sms.limit).toBeNull()
  })

  it('trialDaysLeft counts down from TRIAL_DAYS and can go negative once overdue', async () => {
    const supabase = fakeSupabase([])
    const longAgo = new Date(Date.now() - 20 * 24 * 60 * 60_000).toISOString()

    const usage = await getPlanUsage(supabase, BIZ, {
      planStatus: 'trial', trialStartedAt: longAgo, planStartedAt: longAgo, callMinutesCap: null, smsCap: null,
    }, TZ)

    expect(usage.trialDaysLeft).toBeLessThan(0)
  })
})

describe('getPlanUsage — paid plan', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sums minutes from the start of the current billing cycle (anchored to plan_started_at\'s day-of-month, not the 1st)', async () => {
    // Anchored on the 9th — "now" is the 20th of the same month, so the
    // current cycle started on the 9th at midnight Adelaide time (+9:30),
    // i.e. 2026-09-08T14:30:00Z.
    vi.setSystemTime(new Date('2026-09-20T00:00:00.000Z'))
    const anchor = '2026-08-09T03:00:00.000Z'
    const supabase = fakeSupabase([
      { business_id: BIZ, started_at: '2026-09-08T10:00:00.000Z', duration_seconds: 60 }, // 19:30 the 8th Adelaide — before this cycle — excluded
      { business_id: BIZ, started_at: '2026-09-08T20:00:00.000Z', duration_seconds: 120 }, // 05:30 the 9th Adelaide — in this cycle — included
      { business_id: BIZ, started_at: '2026-09-15T00:00:00.000Z', duration_seconds: 180 }, // well within the cycle — included
    ])

    const usage = await getPlanUsage(supabase, BIZ, {
      planStatus: 'active', trialStartedAt: null, planStartedAt: anchor, callMinutesCap: 100, smsCap: null,
    }, TZ)

    expect(usage.minutes.used).toBe(5) // (120 + 180) / 60
    expect(usage.callCount).toBe(2)
    expect(usage.isTrial).toBe(false)
  })

  it('does NOT reach back before the actual conversion instant on the same calendar day as the anchor (trial→paid same-day fix)', async () => {
    // Client was on trial all morning, converts to paid at 15:00 Adelaide the same day.
    vi.setSystemTime(new Date('2026-09-09T07:00:00.000Z')) // 16:30 Adelaide — shortly after conversion
    const planStartedAt = '2026-09-09T05:30:00.000Z' // 15:00 Adelaide (UTC+9:30)
    const supabase = fakeSupabase([
      { business_id: BIZ, started_at: '2026-09-09T01:00:00.000Z', duration_seconds: 60 }, // 10:30 Adelaide — trial call, same day, BEFORE conversion
      { business_id: BIZ, started_at: '2026-09-09T06:00:00.000Z', duration_seconds: 120 }, // 15:30 Adelaide — first real paid-plan call, AFTER conversion
    ])

    const usage = await getPlanUsage(supabase, BIZ, {
      planStatus: 'active', trialStartedAt: null, planStartedAt, callMinutesCap: 100, smsCap: null,
    }, TZ)

    // Without the fix this would include the pre-conversion trial call too
    // (cycleStart falls back to midnight on the 9th).
    expect(usage.minutes.used).toBe(2)
  })

  it('a cycle that is not the first one is unaffected by the same-day clamp (cycleStart already well after the anchor)', async () => {
    vi.setSystemTime(new Date('2026-11-09T04:00:00.000Z')) // two cycles later
    const anchor = '2026-09-09T05:30:00.000Z'
    const supabase = fakeSupabase([
      { business_id: BIZ, started_at: '2026-11-08T10:00:00.000Z', duration_seconds: 60 }, // 19:30 the 8th Adelaide — before this cycle's start — excluded
      { business_id: BIZ, started_at: '2026-11-08T20:00:00.000Z', duration_seconds: 120 }, // 05:30 the 9th Adelaide — this cycle — included
    ])

    const usage = await getPlanUsage(supabase, BIZ, {
      planStatus: 'active', trialStartedAt: null, planStartedAt: anchor, callMinutesCap: 100, smsCap: null,
    }, TZ)

    expect(usage.minutes.used).toBe(2)
  })

  it('no cap set on a metric means no limit/pct even though it still counts usage', async () => {
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'))
    const anchor = '2026-09-01T00:00:00.000Z'
    const supabase = fakeSupabase(
      [{ business_id: BIZ, started_at: '2026-09-02T00:00:00.000Z', duration_seconds: 60 }],
      [{ business_id: BIZ, sent_at: '2026-09-02T00:00:00.000Z' }],
    )

    const usage = await getPlanUsage(supabase, BIZ, {
      planStatus: 'active', trialStartedAt: null, planStartedAt: anchor, callMinutesCap: null, smsCap: null,
    }, TZ)

    expect(usage.minutes.limit).toBeNull()
    expect(usage.minutes.pct).toBeNull()
    expect(usage.minutes.used).toBe(1)
    expect(usage.sms.limit).toBeNull()
    expect(usage.sms.used).toBe(1)
  })

  it('pct is capped at 999 for wildly over-cap usage', async () => {
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'))
    const anchor = '2026-09-01T00:00:00.000Z'
    const calls = Array.from({ length: 500 }, (_, i) => ({
      business_id: BIZ, started_at: `2026-09-0${1 + (i % 8)}T00:00:00.000Z`, duration_seconds: 60,
    }))
    const supabase = fakeSupabase(calls)

    const usage = await getPlanUsage(supabase, BIZ, {
      planStatus: 'active', trialStartedAt: null, planStartedAt: anchor, callMinutesCap: 1, smsCap: null,
    }, TZ)

    expect(usage.minutes.pct).toBe(999)
  })

  it('SMS usage is independent of the call-minutes cap/usage', async () => {
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'))
    const anchor = '2026-09-01T00:00:00.000Z'
    const supabase = fakeSupabase([], [
      { business_id: BIZ, sent_at: '2026-09-02T00:00:00.000Z' },
      { business_id: BIZ, sent_at: '2026-09-03T00:00:00.000Z' },
      { business_id: BIZ, sent_at: '2026-08-15T00:00:00.000Z' }, // before this cycle — excluded
    ])

    const usage = await getPlanUsage(supabase, BIZ, {
      planStatus: 'active', trialStartedAt: null, planStartedAt: anchor, callMinutesCap: null, smsCap: 10,
    }, TZ)

    expect(usage.sms.used).toBe(2)
    expect(usage.sms.limit).toBe(10)
    expect(usage.sms.pct).toBe(20)
    expect(usage.minutes.used).toBe(0)
  })
})
