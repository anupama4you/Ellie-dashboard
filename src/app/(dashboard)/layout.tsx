import { getCurrentBusiness } from '@/lib/business'
import { getCalls, type VapiCall } from '@/lib/vapi'
import { localDateStr } from '@/lib/dates'
import Sidebar from '@/components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, business: biz } = await getCurrentBusiness()

  // Kept within the shortest common Vapi retention window (14 days) so this
  // best-effort sidebar stat doesn't 400 on lower-tier plans.
  const WINDOW_DAYS = 14
  let coveragePct = 100
  let streakDays   = 0

  if (biz?.vapi_assistant_id) {
    try {
      const since = new Date()
      since.setDate(since.getDate() - WINDOW_DAYS)
      const calls = await getCalls(biz.vapi_assistant_id, 300, 1, { from: localDateStr(since) })

      if (calls.length) {
        const missed = calls.filter(c => c.endedReason === 'customer-did-not-answer').length
        coveragePct = Math.round(((calls.length - missed) / calls.length) * 100)

        const byDay = new Map<string, VapiCall[]>()
        for (const c of calls) {
          if (!c.startedAt) continue
          const day = localDateStr(new Date(c.startedAt))
          if (!byDay.has(day)) byDay.set(day, [])
          byDay.get(day)!.push(c)
        }

        for (let i = 0; i < WINDOW_DAYS; i++) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          const key = localDateStr(d)
          const dayHadMiss = (byDay.get(key) ?? []).some(c => c.endedReason === 'customer-did-not-answer')
          if (dayHadMiss) break
          streakDays++
        }
      }
    } catch (err) {
      console.error('Failed to compute coverage stats:', err)
    }
  }

  const isAdmin = Boolean(user?.email && user.email === process.env.ADMIN_EMAIL)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--paper)' }}>
      <Sidebar
        businessName={biz?.name ?? 'Your business'}
        userEmail={user?.email ?? ''}
        coveragePct={coveragePct}
        streakDays={streakDays}
        isAdmin={isAdmin}
      />
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
