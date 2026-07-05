import { createClient } from '@/lib/supabase/server'
import { getCalls, type VapiCall } from '@/lib/vapi'
import Sidebar from '@/components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: biz } = await supabase
    .from('businesses')
    .select('name, vapi_assistant_id')
    .eq('user_id', user?.id)
    .single()

  const WINDOW_DAYS = 30
  let coveragePct = 100
  let streakDays   = 0

  if (biz?.vapi_assistant_id) {
    try {
      const since = new Date()
      since.setDate(since.getDate() - WINDOW_DAYS)
      const calls = await getCalls(biz.vapi_assistant_id, 300, 1, { from: since.toISOString().slice(0, 10) })

      if (calls.length) {
        const missed = calls.filter(c => c.endedReason === 'customer-did-not-answer').length
        coveragePct = Math.round(((calls.length - missed) / calls.length) * 100)

        const byDay = new Map<string, VapiCall[]>()
        for (const c of calls) {
          if (!c.startedAt) continue
          const day = c.startedAt.slice(0, 10)
          if (!byDay.has(day)) byDay.set(day, [])
          byDay.get(day)!.push(c)
        }

        for (let i = 0; i < WINDOW_DAYS; i++) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          const key = d.toISOString().slice(0, 10)
          const dayHadMiss = (byDay.get(key) ?? []).some(c => c.endedReason === 'customer-did-not-answer')
          if (dayHadMiss) break
          streakDays++
        }
      }
    } catch (err) {
      console.error('Failed to compute coverage stats:', err)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--paper)' }}>
      <Sidebar
        businessName={biz?.name ?? 'Your business'}
        userEmail={user?.email ?? ''}
        coveragePct={coveragePct}
        streakDays={streakDays}
      />
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
