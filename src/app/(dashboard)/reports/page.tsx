import { createClient } from '@/lib/supabase/server'
import { getCalls } from '@/lib/vapi'
import AnalyticsCharts from '@/components/AnalyticsCharts'

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: biz } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', user?.id)
    .single()

  let calls: Awaited<ReturnType<typeof getCalls>> = []
  if (biz?.vapi_assistant_id) {
    try { calls = await getCalls(biz.vapi_assistant_id, 200) } catch {}
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6">
        <AnalyticsCharts calls={calls} plan={biz?.plan ?? 'core'} />
      </div>
    </div>
  )
}
