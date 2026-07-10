import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { getLocalCalls, callSummary, type LocalCall } from '@/lib/calls'
import { dateStrInZone, startOfDayInZone, addDaysInZone, dayOfWeekInZone, hourInZone, formatInZone } from '@/lib/timezone'
import { getPlanUsage } from '@/lib/planUsage'
import { isAfterHours } from '@/lib/availability'
import type { Hours } from './briefing/actions'
import Link from 'next/link'
import RecentCallsCard, { type RecentCallItem, type RecentCallCategory } from '@/components/RecentCallsCard'
import WeeklyCallsChart, { type WeekDay } from '@/components/WeeklyCallsChart'
import {
  CalendarDays, AlertCircle, CheckCircle2, DollarSign, Sparkles, AlertTriangle,
  Phone, PhoneForwarded, PhoneCall, ArrowUp, ArrowDown,
} from 'lucide-react'

const OUTCOME_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  booked:      { label: 'Booked',      color: 'var(--signal)', bg: 'var(--signal-soft)' },
  rebooked:    { label: 'Rebooked',    color: 'var(--violet)', bg: 'var(--violet-soft)' },
  enquiry:     { label: 'Enquiry',     color: 'var(--violet)', bg: 'var(--violet-soft)' },
  transferred: { label: 'Transferred', color: 'var(--amber)',  bg: 'var(--amber-soft)'  },
  missed:      { label: 'Missed',      color: 'var(--coral)',  bg: 'var(--coral-soft)'  },
  errored:     { label: 'Error',       color: 'var(--coral)',  bg: 'var(--coral-soft)'  },
}

function getGreeting(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

type Appointment = {
  id: string
  customer_name: string
  customer_phone?: string
  service?: string
  scheduled_at: string
  status: string
  notes?: string | null
  sms_sent?: boolean
}

const WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

/** null = no prior-period baseline to compare against (shown as "new" rather than a misleading ±∞%). */
function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? null : 0
  return Math.round(((current - previous) / previous) * 100)
}

function TrendLabel({ delta, suffix = ' vs last week' }: { delta: number | null; suffix?: string }) {
  if (delta === null) return <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>New this week</span>
  if (delta === 0) return <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Same as last week</span>
  const up = delta > 0
  return (
    <span className="text-[11px] flex items-center gap-0.5" style={{ color: up ? 'var(--signal)' : 'var(--coral)' }}>
      {up ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
      {Math.abs(delta)}%{suffix}
    </span>
  )
}

export default async function TodayPage() {
  const { business: biz } = await getCurrentBusiness()
  const supabase = await createClient()

  const timeZone = biz?.timezone ?? 'Australia/Adelaide'
  const now  = new Date()
  const hour = hourInZone(now, timeZone)

  const dayStart      = startOfDayInZone(now, timeZone)
  const dayEnd        = new Date(addDaysInZone(now, 1, timeZone).getTime() - 1)
  const weekStart     = addDaysInZone(now, -6, timeZone)
  const prevWeekStart = addDaysInZone(now, -13, timeZone)
  const prevWeekEndStr = dateStrInZone(addDaysInZone(now, -7, timeZone), timeZone)

  const noCalls: LocalCall[] = []
  const [
    { data: upcomingApptsRaw },
    { data: weekBookingsRaw },
    { data: prevWeekBookingsRaw },
    { data: services },
    weekCalls,
    prevWeekCalls,
  ] = await Promise.all([
    // Upcoming, not historical — this is "what's on the calendar next", independent of when it was booked.
    supabase.from('appointments').select('*')
      .eq('business_id', biz?.id)
      .neq('status', 'cancelled')
      .gte('scheduled_at', now.toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(6),
    // "Bookings made" is about booking *activity*, so it's scoped by created_at, not scheduled_at (an appointment booked today for next month still counts as made this week).
    supabase.from('appointments').select('service, created_at')
      .eq('business_id', biz?.id)
      .neq('status', 'cancelled')
      .gte('created_at', weekStart.toISOString()),
    supabase.from('appointments').select('service, created_at')
      .eq('business_id', biz?.id)
      .neq('status', 'cancelled')
      .gte('created_at', prevWeekStart.toISOString())
      .lt('created_at', weekStart.toISOString()),
    supabase.from('business_services').select('name, price_cents').eq('business_id', biz?.id),
    biz
      ? getLocalCalls(biz.id, { limit: 500, dateRange: { from: dateStrInZone(weekStart, timeZone), timeZone } }).catch(err => { console.error('Failed to fetch local weekly calls:', err); return noCalls })
      : Promise.resolve(noCalls),
    biz
      ? getLocalCalls(biz.id, { limit: 500, dateRange: { from: dateStrInZone(prevWeekStart, timeZone), to: prevWeekEndStr, timeZone } }).catch(err => { console.error('Failed to fetch local previous-week calls:', err); return noCalls })
      : Promise.resolve(noCalls),
  ])

  const upcomingAppts   = (upcomingApptsRaw ?? []) as Appointment[]
  const weekBookings    = weekBookingsRaw ?? []
  const prevWeekBookings = prevWeekBookingsRaw ?? []

  const todayCalls = weekCalls.filter(c => {
    if (!c.started_at) return false
    const d = new Date(c.started_at)
    return d >= dayStart && d <= dayEnd
  })

  const weekAnswered     = weekCalls.filter(c => c.outcome !== 'missed').length
  const prevWeekAnswered = prevWeekCalls.filter(c => c.outcome !== 'missed').length
  const weekMissed       = weekCalls.filter(c => c.outcome === 'missed').length

  const answeredDelta  = pctDelta(weekAnswered, prevWeekAnswered)
  const bookingsDelta  = pctDelta(weekBookings.length, prevWeekBookings.length)

  // Lowercased keys — appointments' `service` is free text Ellie sent when
  // booking, not guaranteed to match a configured service name's exact case.
  const priceByService = new Map((services ?? []).map(s => [s.name.toLowerCase(), s.price_cents as number | null]))
  const configuredPrices = (services ?? [])
    .map(s => s.price_cents as number | null)
    .filter((c): c is number => c != null && c > 0)
  const fallbackPriceCents = configuredPrices.length
    ? Math.round(configuredPrices.reduce((a, b) => a + b, 0) / configuredPrices.length)
    : 5000
  function revenueCents(appts: { service: string | null }[]): number {
    return appts.reduce((sum, a) => sum + (priceByService.get(a.service?.toLowerCase() ?? '') ?? fallbackPriceCents), 0)
  }
  const weekRevenueCents     = revenueCents(weekBookings)
  const prevWeekRevenueCents = revenueCents(prevWeekBookings)
  const revenueDelta = pctDelta(weekRevenueCents, prevWeekRevenueCents)

  // Last 7 days chart data (oldest → today) — bookings counted by created_at, matching the "Bookings made" KPI's meaning.
  const weekDays: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDaysInZone(dayStart, -(6 - i), timeZone)
    const key = dateStrInZone(d, timeZone)
    const dayCallsCount = weekCalls.filter(c => c.started_at && dateStrInZone(new Date(c.started_at), timeZone) === key).length
    const dayBookingsCount = weekBookings.filter(a => a.created_at && dateStrInZone(new Date(a.created_at), timeZone) === key).length
    const dow = dayOfWeekInZone(d, timeZone)
    return { label: WEEKDAY_LABELS[dow === 0 ? 6 : dow - 1], calls: dayCallsCount, bookings: dayBookingsCount }
  })
  const weekTotalCalls    = weekDays.reduce((s, d) => s + d.calls, 0)
  const weekTotalBookings = weekDays.reduce((s, d) => s + d.bookings, 0)
  const weekConversion    = weekTotalCalls > 0 ? Math.round((weekTotalBookings / weekTotalCalls) * 100) : 0

  const dateLabel = formatInZone(now, timeZone, { weekday: 'long', day: 'numeric', month: 'long' })

  const usage = biz
    ? await getPlanUsage(
        supabase, biz.id,
        { plan: biz.plan, planStatus: biz.plan_status, trialStartedAt: biz.trial_started_at, planStartedAt: biz.plan_started_at },
        timeZone,
      ).catch(() => null)
    : null

  const bizHours = (biz?.hours as Hours | undefined) ?? null
  const recentCallItems: RecentCallItem[] = weekCalls.slice(0, 40).map(call => {
    const outcome = (call.outcome ?? 'enquiry') as RecentCallCategory
    const style   = OUTCOME_STYLE[outcome] ?? OUTCOME_STYLE.enquiry
    const started = call.started_at ? new Date(call.started_at) : null
    const afterHours = started ? isAfterHours(started, bizHours, timeZone) : false
    const isToday     = started ? dateStrInZone(started, timeZone) === dateStrInZone(now, timeZone) : false
    const isYesterday = started ? dateStrInZone(started, timeZone) === dateStrInZone(addDaysInZone(now, -1, timeZone), timeZone) : false
    const timeLabel = started
      ? `${isToday ? 'Today' : isYesterday ? 'Yest' : formatInZone(started, timeZone, { day: 'numeric', month: 'short' })} ${formatInZone(started, timeZone, { hour: 'numeric', minute: '2-digit' })}`
      : '—'
    const dur = call.duration_seconds ?? 0
    const durationLabel = `${Math.floor(dur / 60)}m ${String(dur % 60).padStart(2, '0')}s`
    return {
      id: call.id,
      displayName: call.caller_name?.trim() || call.caller_phone || 'Unknown caller',
      subLabel: call.caller_name && call.caller_phone ? call.caller_phone : undefined,
      summary: outcome === 'missed' ? 'Missed call' : callSummary(call).text,
      category: outcome,
      badgeLabel: style.label,
      badgeColor: style.color,
      badgeBg: style.bg,
      isAfterHours: afterHours,
      timeLabel,
      durationLabel,
      recordingUrl: call.recording_url ?? undefined,
      hasTranscript: !!call.transcript,
    }
  })

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1220px] mx-auto flex flex-col gap-5">

        {/* Greeting */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-extrabold leading-tight" style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--ink)' }}>
              {getGreeting(hour)}, {biz?.name ?? 'there'}
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>
              {dateLabel} · Ellie has handled {todayCalls.length} call{todayCalls.length !== 1 ? 's' : ''} so far today
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled title="Coming soon"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold cursor-not-allowed opacity-50"
              style={{ border: '1px solid var(--line)', color: 'var(--ink-2)', background: 'var(--card)' }}>
              <PhoneForwarded size={14} />
              Forward my calls
            </button>
            <button type="button" disabled title="Coming soon"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white cursor-not-allowed opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))' }}>
              <PhoneCall size={14} />
              Test call Ellie
            </button>
          </div>
        </div>

        {/* Trial status */}
        {usage?.isTrial && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'var(--violet-soft)', border: '1px solid rgba(109,74,255,0.2)', color: 'var(--violet)' }}>
            <AlertTriangle size={15} className="shrink-0" />
            <span>
              You&apos;re on a free trial — unlimited calls, {usage.used} so far.
              {' '}{usage.trialDaysLeft != null && usage.trialDaysLeft > 0
                ? `${usage.trialDaysLeft} day${usage.trialDaysLeft !== 1 ? 's' : ''} left.`
                : 'Your trial has ended.'}
            </span>
          </div>
        )}

        {/* Plan usage warning */}
        {usage && usage.pct != null && usage.pct >= 80 && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
            style={{
              background: usage.pct >= 100 ? 'var(--coral-soft)' : 'var(--amber-soft)',
              border: `1px solid ${usage.pct >= 100 ? 'rgba(221,81,64,0.25)' : 'rgba(217,138,11,0.25)'}`,
              color: usage.pct >= 100 ? 'var(--coral)' : 'var(--amber)',
            }}>
            <AlertTriangle size={15} className="shrink-0" />
            <span>
              {usage.pct >= 100
                ? `You're over your plan's included calls this month (${usage.used} of ${usage.limit}).`
                : `You've used ${usage.used} of ${usage.limit} calls included in your plan this month (${usage.pct}%).`}
              {' '}Usage renews {formatInZone(usage.renewsAt, timeZone, { day: 'numeric', month: 'long' })}.
              {' '}Reach out to your Ellie account manager if you would like to upgrade.
            </span>
          </div>
        )}

        {/* KPI cards — this week, vs the 7 days before */}
        <div className="grid grid-cols-4 gap-3.5">
          <div className="rounded-2xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Calls answered</span>
              <span className="w-6.5 h-6.5 rounded-lg flex items-center justify-center" style={{ background: 'var(--violet-soft)' }}>
                <Phone size={13} style={{ color: 'var(--violet)' }} />
              </span>
            </div>
            <p className="font-extrabold mt-2" style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--ink)' }}>{weekAnswered}</p>
            <div className="mt-1"><TrendLabel delta={answeredDelta} /></div>
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Bookings made</span>
              <span className="w-6.5 h-6.5 rounded-lg flex items-center justify-center" style={{ background: 'var(--signal-soft)' }}>
                <CalendarDays size={13} style={{ color: 'var(--signal)' }} />
              </span>
            </div>
            <p className="font-extrabold mt-2" style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--ink)' }}>{weekBookings.length}</p>
            <div className="mt-1"><TrendLabel delta={bookingsDelta} /></div>
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Revenue saved</span>
              <span className="w-6.5 h-6.5 rounded-lg flex items-center justify-center" style={{ background: 'var(--amber-soft)' }}>
                <DollarSign size={13} style={{ color: 'var(--amber)' }} />
              </span>
            </div>
            <p className="font-extrabold mt-2" style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--signal)' }}>
              +${(weekRevenueCents / 100).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
            <div className="mt-1"><TrendLabel delta={revenueDelta} /></div>
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Missed calls</span>
              <span className="w-6.5 h-6.5 rounded-lg flex items-center justify-center" style={{ background: weekMissed === 0 ? 'var(--signal-soft)' : 'var(--coral-soft)' }}>
                {weekMissed === 0
                  ? <CheckCircle2 size={13} style={{ color: 'var(--signal)' }} />
                  : <AlertCircle  size={13} style={{ color: 'var(--coral)' }} />}
              </span>
            </div>
            <p className="font-extrabold mt-2" style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: weekMissed === 0 ? 'var(--signal)' : 'var(--coral)' }}>
              {weekMissed}
            </p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>
              {weekMissed === 0 ? 'Ellie answered every one this week' : 'this week'}
            </p>
          </div>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: '1.9fr 1fr' }}>
          {/* Recent calls */}
          <section className="rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <div>
                <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Recent calls</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{weekCalls.length} this week · every call recorded and transcribed</p>
              </div>
              <Link href="/calls" className="text-sm font-semibold shrink-0" style={{ color: 'var(--violet)' }}>View all calls →</Link>
            </div>

            {recentCallItems.length === 0 ? (
              <div className="py-16 text-center mx-5 mb-4 rounded-xl flex flex-col items-center gap-3" style={{ background: 'var(--paper)' }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--violet-soft)' }}>
                  <Phone size={20} style={{ color: 'var(--violet)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>No calls yet this week</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>Ellie is ready and waiting</p>
                </div>
              </div>
            ) : (
              <RecentCallsCard calls={recentCallItems} />
            )}
          </section>

          {/* Right rail */}
          <div className="flex flex-col gap-4">
            {/* Booked by Ellie */}
            <section className="rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
              <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
                <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Booked by Ellie</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                  Next {upcomingAppts.length} upcoming appointment{upcomingAppts.length !== 1 ? 's' : ''}
                </p>
              </div>
              {upcomingAppts.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Nothing upcoming yet</p>
                </div>
              ) : (
                upcomingAppts.map((appt, i) => {
                  const d = new Date(appt.scheduled_at)
                  const dayNum = formatInZone(d, timeZone, { day: 'numeric' })
                  const dow    = formatInZone(d, timeZone, { weekday: 'short' }).toUpperCase()
                  const t      = formatInZone(d, timeZone, { hour: '2-digit', minute: '2-digit' })
                  return (
                    <div key={appt.id} className="flex items-center gap-3 px-5 py-3"
                      style={{ borderTop: i > 0 ? '1px solid var(--line)' : undefined }}
                      title={appt.notes ?? undefined}>
                      <div className="flex flex-col items-center shrink-0" style={{ width: 34 }}>
                        <span className="text-[10px] font-bold" style={{ color: 'var(--ink-3)' }}>{dow}</span>
                        <span className="text-base font-extrabold leading-none mt-0.5" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>{dayNum}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{appt.customer_name}</p>
                        {appt.service && <p className="text-xs truncate mt-0.5" style={{ color: 'var(--ink-3)' }}>{appt.service}</p>}
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <span className="text-xs font-mono font-semibold" style={{ color: 'var(--violet)' }}>{t}</span>
                        {appt.sms_sent && (
                          <span className="text-[10px] font-semibold flex items-center gap-0.5" style={{ color: 'var(--signal)' }}>
                            <CheckCircle2 size={9} /> SMS sent
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
              <div className="p-3">
                <Link href="/appointments" className="block text-center text-sm font-semibold rounded-lg py-2"
                  style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}>
                  Open calendar
                </Link>
              </div>
            </section>

            {/* Last 7 days */}
            <section className="rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
              <div className="px-5 pt-4 pb-1">
                <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Last 7 days</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Calls answered vs bookings made</p>
              </div>
              <div className="px-3 pb-2">
                <WeeklyCallsChart data={weekDays} />
              </div>
              <div className="flex px-5 pb-4 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
                <div className="flex-1">
                  <b className="block font-extrabold text-lg" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>{weekTotalCalls}</b>
                  <span className="text-xs" style={{ color: 'var(--ink-3)' }}>Calls</span>
                </div>
                <div className="flex-1">
                  <b className="block font-extrabold text-lg" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>{weekTotalBookings}</b>
                  <span className="text-xs" style={{ color: 'var(--ink-3)' }}>Bookings</span>
                </div>
                <div className="flex-1">
                  <b className="block font-extrabold text-lg" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>{weekConversion}%</b>
                  <span className="text-xs" style={{ color: 'var(--ink-3)' }}>Conversion</span>
                </div>
              </div>
            </section>

            {/* Morning brief */}
            <section className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, var(--night-2), var(--night))', color: '#DCD6EC' }}>
              <h3 className="flex items-center gap-2 font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>
                <Sparkles size={15} style={{ color: 'var(--signal)' }} /> Today so far
              </h3>
              <p className="text-sm leading-relaxed mt-2" style={{ color: '#B9B2CE' }}>
                Ellie has answered <b className="text-white">{todayCalls.filter(c => c.outcome !== 'missed').length}</b> call{todayCalls.filter(c => c.outcome !== 'missed').length !== 1 ? 's' : ''} today
                {todayCalls.filter(c => c.outcome === 'booked').length > 0 && (
                  <> and booked <b className="text-white">{todayCalls.filter(c => c.outcome === 'booked').length}</b> appointment{todayCalls.filter(c => c.outcome === 'booked').length !== 1 ? 's' : ''}</>
                )}
                {todayCalls.filter(c => c.outcome === 'missed').length > 0
                  ? <> — <b className="text-white">{todayCalls.filter(c => c.outcome === 'missed').length}</b> went unanswered and may need a follow-up.</>
                  : <>. Nothing needs your attention.</>}
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
