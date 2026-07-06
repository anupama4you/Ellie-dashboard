import { getCurrentBusiness } from '@/lib/business'
import { getCalls } from '@/lib/vapi'
import AnalyticsCharts from '@/components/AnalyticsCharts'

export default async function AnalyticsPage() {
  const { business: biz } = await getCurrentBusiness()

  let calls: Awaited<ReturnType<typeof getCalls>> = []
  if (biz?.vapi_assistant_id) {
    try { calls = await getCalls(biz.vapi_assistant_id, 200) } catch (err) { console.error('Failed to fetch calls from Vapi:', err) }
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
        <AnalyticsCharts calls={calls} plan={biz?.plan ?? 'core'} />
      </div>
    </div>
  )
}
