import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { getLocalCalls, type LocalCall } from '@/lib/calls'
import { getPlanUsage, type PlanUsage } from '@/lib/planUsage'
import { dateStrInZone, addDaysInZone, formatInZone } from '@/lib/timezone'
import type { Hours } from '../briefing/actions'
import AnalyticsCharts from '@/components/AnalyticsCharts'
import AnalyticsRangeSelect from '@/components/AnalyticsRangeSelect'
import { Download } from 'lucide-react'

const RANGE_DAYS: Record<string, number> = { '7': 7, '30': 30, '90': 90 }

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const { range: rawRange } = await searchParams
  const range = rawRange && rawRange in RANGE_DAYS ? rawRange : '30'
  const days = RANGE_DAYS[range]

  const { business: biz } = await getCurrentBusiness()
  const timeZone = biz?.timezone ?? 'Australia/Adelaide'
  const bizHours = (biz?.hours as Hours | undefined) ?? null

  const now = new Date()
  const periodStart = addDaysInZone(now, -days, timeZone)
  const prevPeriodStart = addDaysInZone(now, -days * 2, timeZone)
  const prevPeriodEndStr = dateStrInZone(addDaysInZone(now, -days, timeZone), timeZone)

  let calls: LocalCall[] = []
  let prevCalls: LocalCall[] = []
  let usage: PlanUsage = { used: 0, limit: 120, pct: 0, renewsAt: new Date(), isTrial: false, trialDaysLeft: null }

  if (biz) {
    try {
      calls = await getLocalCalls(biz.id, {
        limit: 500,
        dateRange: { from: dateStrInZone(periodStart, timeZone), timeZone },
      })
    } catch (err) { console.error('Failed to fetch local calls:', err) }
    try {
      prevCalls = await getLocalCalls(biz.id, {
        limit: 500,
        dateRange: { from: dateStrInZone(prevPeriodStart, timeZone), to: prevPeriodEndStr, timeZone },
      })
    } catch (err) { console.error('Failed to fetch previous-period calls:', err) }
    try {
      const supabase = await createClient()
      usage = await getPlanUsage(
        supabase, biz.id,
        { plan: biz.plan, planStatus: biz.plan_status, trialStartedAt: biz.trial_started_at, planStartedAt: biz.plan_started_at },
        timeZone,
      )
    } catch (err) { console.error('Failed to compute plan usage:', err) }
  }

  const dateRangeLabel = `${formatInZone(periodStart, timeZone, { day: 'numeric', month: 'long' })} to ${formatInZone(now, timeZone, { day: 'numeric', month: 'long' })}`

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1220px] mx-auto flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--ink)' }}>
              Analytics
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
              What your phone line has been doing, {dateRangeLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AnalyticsRangeSelect range={range} />
            <button
              type="button"
              disabled
              title="Coming soon"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white cursor-not-allowed opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))' }}
            >
              <Download size={14} /> Download report
            </button>
          </div>
        </div>
        <AnalyticsCharts
          calls={calls}
          prevCalls={prevCalls}
          plan={biz?.plan ?? 'core'}
          timeZone={timeZone}
          usage={usage}
          hours={bizHours}
          rangeDays={days}
        />
      </div>
    </div>
  )
}
