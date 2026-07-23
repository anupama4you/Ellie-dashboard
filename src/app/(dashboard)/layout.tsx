import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { getLocalCalls, type LocalCall } from '@/lib/calls'
import { dateStrInZone, addDaysInZone, formatInZone } from '@/lib/timezone'
import { getPlanUsage } from '@/lib/planUsage'
import Sidebar from '@/components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, business: biz } = await getCurrentBusiness()
  const timeZone = biz?.timezone ?? 'Australia/Adelaide'

  const usage = biz
    ? await getPlanUsage(
        await createClient(), biz.id,
        { plan: biz.plan, planStatus: biz.plan_status, trialStartedAt: biz.trial_started_at, planStartedAt: biz.plan_started_at },
        timeZone,
      ).catch(() => null)
    : null

  const WINDOW_DAYS = 14
  let coveragePct = 100
  let streakDays   = 0

  if (biz) {
    try {
      const now = new Date()
      const since = addDaysInZone(now, -WINDOW_DAYS, timeZone)
      const calls = await getLocalCalls(biz.id, { dateRange: { from: dateStrInZone(since, timeZone), timeZone } })

      if (calls.length) {
        const missed = calls.filter(c => c.ended_reason === 'customer-did-not-answer').length
        coveragePct = Math.round(((calls.length - missed) / calls.length) * 100)

        const byDay = new Map<string, LocalCall[]>()
        for (const c of calls) {
          if (!c.started_at) continue
          const day = dateStrInZone(new Date(c.started_at), timeZone)
          if (!byDay.has(day)) byDay.set(day, [])
          byDay.get(day)!.push(c)
        }

        for (let i = 0; i < WINDOW_DAYS; i++) {
          const d = addDaysInZone(now, -i, timeZone)
          const key = dateStrInZone(d, timeZone)
          const dayHadMiss = (byDay.get(key) ?? []).some(c => c.ended_reason === 'customer-did-not-answer')
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
        linePaused={biz?.line_paused ?? false}
        hasAssistant={!!biz?.vapi_assistant_id}
        transferPhoneNumber={biz?.transfer_phone_number ?? null}
        phoneNumber={biz?.twilio_phone_number ?? null}
        usage={usage ? {
          used: usage.used,
          limit: usage.limit,
          pct: usage.pct,
          isTrial: usage.isTrial,
          trialDaysLeft: usage.trialDaysLeft,
          renewsLabel: formatInZone(usage.renewsAt, timeZone, { day: 'numeric', month: 'short' }),
        } : null}
      />
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
