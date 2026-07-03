import { createClient } from '@/lib/supabase/server'
import { getCalls } from '@/lib/vapi'
import AnalyticsCharts from '@/components/AnalyticsCharts'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: biz } = await supabase
    .from('businesses')
    .select('vapi_assistant_id, plan')
    .eq('user_id', user?.id)
    .single()

  let calls: Awaited<ReturnType<typeof getCalls>> = []
  if (biz?.vapi_assistant_id) {
    try { calls = await getCalls(biz.vapi_assistant_id, 200) } catch (err) { console.error('Failed to fetch calls from Vapi:', err) }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <main className="flex-1 overflow-y-auto p-6">
        <AnalyticsCharts calls={calls} plan={biz?.plan ?? 'core'} />
      </main>
    </div>
  )
}
