import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { getLocalCalls, type LocalCall } from '@/lib/calls'
import { getPlanUsage, type PlanUsage } from '@/lib/planUsage'
import AnalyticsCharts from '@/components/AnalyticsCharts'

export default async function AnalyticsPage() {
  const { business: biz } = await getCurrentBusiness()
  const timeZone = biz?.timezone ?? 'Australia/Adelaide'

  let calls: LocalCall[] = []
  let usage: PlanUsage = { used: 0, limit: 120, pct: 0, renewsAt: new Date() }
  if (biz) {
    try { calls = await getLocalCalls(biz.id, { limit: 200 }) } catch (err) { console.error('Failed to fetch local calls:', err) }
    try {
      const supabase = await createClient()
      usage = await getPlanUsage(supabase, biz.id, biz.plan, timeZone)
    } catch (err) { console.error('Failed to compute plan usage:', err) }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1220px] mx-auto flex flex-col gap-4">
        <div>
          <h1 className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--ink)' }}>
            Analytics
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>What your phone line has been doing</p>
        </div>
        <AnalyticsCharts calls={calls} plan={biz?.plan ?? 'core'} timeZone={timeZone} usage={usage} />
      </div>
    </div>
  )
}
