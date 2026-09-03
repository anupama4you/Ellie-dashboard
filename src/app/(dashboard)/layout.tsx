import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { getLocalCallsList, type LocalCallListItem } from '@/lib/calls'
import { dateStrInZone, addDaysInZone, formatInZone } from '@/lib/timezone'
import { getPlanUsage } from '@/lib/planUsage'
import { resolveDashboardFeatures } from '@/lib/dashboardFeatures'
import { NavigationBlockerProvider } from '@/lib/navigationBlocker'
import Sidebar from '@/components/Sidebar'
import AccountDisabledScreen from '@/components/AccountDisabledScreen'

const WINDOW_DAYS = 14

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, business: biz } = await getCurrentBusiness()
  const timeZone = biz?.timezone ?? 'Australia/Adelaide'

  const isAdmin = Boolean(user?.email && user.email === process.env.ADMIN_EMAIL)
  const features = resolveDashboardFeatures(biz)

  // The one real access gate in the app — plan_status (trial/active/cancelled)
  // is purely a display label with no enforcement anywhere else. Admins are
  // exempt so they can never lock themselves out of their own business row.
  if (biz?.account_disabled && !isAdmin) {
    return <AccountDisabledScreen businessName={biz.name} />
  }

  const now   = new Date()
  const since = addDaysInZone(now, -WINDOW_DAYS, timeZone)

  // This layout re-runs on every navigation between dashboard pages, so these
  // two independent lookups (sidebar usage bar + coverage/streak stats) run
  // in parallel rather than one blocking the other — and the coverage query
  // only selects the couple of columns it actually needs (see getLocalCallsList),
  // not full rows with transcript/raw_payload.
  const [usage, calls] = biz
    ? await Promise.all([
        getPlanUsage(
          await createClient(), biz.id,
          { plan: biz.plan, planStatus: biz.plan_status, trialStartedAt: biz.trial_started_at, planStartedAt: biz.plan_started_at },
          timeZone,
        ).catch(() => null),
        getLocalCallsList(biz.id, { dateRange: { from: dateStrInZone(since, timeZone), timeZone } })
          .catch((err): LocalCallListItem[] => { console.error('Failed to compute coverage stats:', err); return [] }),
      ])
    : [null, [] as LocalCallListItem[]]

  let coveragePct = 100
  let streakDays   = 0

  if (calls.length) {
    const missed = calls.filter(c => c.ended_reason === 'customer-did-not-answer').length
    coveragePct = Math.round(((calls.length - missed) / calls.length) * 100)

    const byDay = new Map<string, LocalCallListItem[]>()
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

  return (
    <NavigationBlockerProvider>
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
          features={features}
          usage={usage ? {
            used: usage.used,
            limit: usage.limit,
            pct: usage.pct,
            isTrial: usage.isTrial,
            isUnlimited: usage.isUnlimited,
            trialDaysLeft: usage.trialDaysLeft,
            renewsLabel: formatInZone(usage.renewsAt, timeZone, { day: 'numeric', month: 'short' }),
          } : null}
        />
        <div className="flex-1 overflow-hidden pt-14 md:pt-0">
          {children}
        </div>
      </div>
    </NavigationBlockerProvider>
  )
}
