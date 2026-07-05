import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCalls } from '@/lib/vapi'
import TodayCallRow from '@/components/TodayCallRow'
import WeeklyCallsChart, { type WeekDay } from '@/components/WeeklyCallsChart'
import { Phone, CalendarDays, AlertCircle, CheckCircle2, DollarSign, Sparkles } from 'lucide-react'

const BADGES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  'appointment-scheduled':   { label: 'Booked',      color: 'var(--signal)', bg: 'var(--signal-soft)', border: 'rgba(15,163,122,0.25)'  },
  'customer-ended-call':     { label: 'Ended',       color: 'var(--signal)', bg: 'var(--signal-soft)', border: 'rgba(15,163,122,0.2)'   },
  'assistant-ended-call':    { label: 'Completed',   color: 'var(--violet)', bg: 'var(--violet-soft)', border: 'rgba(109,74,255,0.2)'   },
  'call-transferred':        { label: 'Transferred', color: 'var(--amber)',  bg: 'var(--amber-soft)',  border: 'rgba(217,138,11,0.25)' },
  'customer-did-not-answer': { label: 'Missed',      color: 'var(--coral)',  bg: 'var(--coral-soft)',  border: 'rgba(221,81,64,0.25)'  },
  'voicemail':               { label: 'Voicemail',   color: 'var(--amber)',  bg: 'var(--amber-soft)',  border: 'rgba(217,138,11,0.25)' },
}

function getBadge(reason?: string) {
  if (reason && BADGES[reason]) return BADGES[reason]
  if (!reason) return { label: 'Completed', color: 'var(--violet)', bg: 'var(--violet-soft)', border: 'rgba(109,74,255,0.2)' }
  const low = reason.toLowerCase()
  if (low.includes('error')) return { label: 'Error', color: 'var(--coral)', bg: 'var(--coral-soft)', border: 'rgba(221,81,64,0.2)' }
  return { label: 'Info', color: 'var(--ink-3)', bg: 'var(--paper)', border: 'var(--line)' }
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
}

const STATUS_APPT: Record<string, { color: string; bg: string; border: string }> = {
  confirmed:   { color: 'var(--signal)', bg: 'var(--signal-soft)', border: 'rgba(15,163,122,0.22)'  },
  pending:     { color: 'var(--amber)',  bg: 'var(--amber-soft)',  border: 'rgba(217,138,11,0.2)'   },
  cancelled:   { color: 'var(--coral)',  bg: 'var(--coral-soft)',  border: 'rgba(221,81,64,0.2)'    },
  completed:   { color: 'var(--violet)', bg: 'var(--violet-soft)', border: 'rgba(109,74,255,0.2)'   },
  rescheduled: { color: 'var(--violet)', bg: 'var(--violet-soft)', border: 'rgba(109,74,255,0.2)'   },
}

const WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

export default async function TodayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: biz } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', user?.id)
    .single()

  const now  = new Date()
  const hour = now.getHours()

  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0)
  const dayEnd   = new Date(now); dayEnd.setHours(23, 59, 59, 999)

  const { data: allAppts } = await supabase
    .from('appointments')
    .select('*')
    .eq('business_id', biz?.id)
    .order('scheduled_at', { ascending: true })

  const { data: services } = await supabase
    .from('business_services')
    .select('name, price_cents')
    .eq('business_id', biz?.id)
  const priceByService = new Map((services ?? []).map(s => [s.name, s.price_cents as number | null]))

  const todayAppts = (allAppts ?? []).filter(a => {
    const d = new Date(a.scheduled_at)
    return d >= dayStart && d <= dayEnd && a.status !== 'cancelled'
  })
  const revenueBookedCents = todayAppts.reduce((sum, a) => sum + (priceByService.get(a.service) ?? 0), 0)

  let allCalls: Awaited<ReturnType<typeof getCalls>> = []
  let weekCalls: Awaited<ReturnType<typeof getCalls>> = []
  if (biz?.vapi_assistant_id) {
    try { allCalls = await getCalls(biz.vapi_assistant_id, 100) } catch (err) { console.error('Failed to fetch calls from Vapi:', err) }
    try {
      const weekStart = new Date(dayStart); weekStart.setDate(weekStart.getDate() - 6)
      weekCalls = await getCalls(biz.vapi_assistant_id, 500, 1, { from: weekStart.toISOString().slice(0, 10) })
    } catch (err) { console.error('Failed to fetch weekly calls from Vapi:', err) }
  }
  const todayCalls = allCalls.filter(c => {
    if (!c.startedAt) return false
    const d = new Date(c.startedAt)
    return d >= dayStart && d <= dayEnd
  })

  const answered = todayCalls.filter(c => c.endedReason !== 'customer-did-not-answer').length
  const booked   = todayAppts.length
  const missed   = todayCalls.filter(c => c.endedReason === 'customer-did-not-answer').length

  // Last 7 days chart data (oldest → today)
  const weekDays: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(dayStart); d.setDate(d.getDate() - (6 - i))
    const key = d.toISOString().slice(0, 10)
    const dayCallsCount = weekCalls.filter(c => c.startedAt?.slice(0, 10) === key).length
    const dayBookingsCount = (allAppts ?? []).filter(a =>
      a.scheduled_at.slice(0, 10) === key && a.status !== 'cancelled'
    ).length
    return { label: WEEKDAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1], calls: dayCallsCount, bookings: dayBookingsCount }
  })
  const weekTotalCalls    = weekDays.reduce((s, d) => s + d.calls, 0)
  const weekTotalBookings = weekDays.reduce((s, d) => s + d.bookings, 0)
  const weekConversion    = weekTotalCalls > 0 ? Math.round((weekTotalBookings / weekTotalCalls) * 100) : 0

  const dateLabel = now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })

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
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-3.5">
          <div className="rounded-2xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Calls answered</span>
              <span className="w-6.5 h-6.5 rounded-lg flex items-center justify-center" style={{ background: 'var(--violet-soft)' }}>
                <Phone size={13} style={{ color: 'var(--violet)' }} />
              </span>
            </div>
            <p className="font-extrabold mt-2" style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--ink)' }}>{answered}</p>
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Booked today</span>
              <span className="w-6.5 h-6.5 rounded-lg flex items-center justify-center" style={{ background: 'var(--signal-soft)' }}>
                <CalendarDays size={13} style={{ color: 'var(--signal)' }} />
              </span>
            </div>
            <p className="font-extrabold mt-2" style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--ink)' }}>{booked}</p>
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Revenue booked</span>
              <span className="w-6.5 h-6.5 rounded-lg flex items-center justify-center" style={{ background: 'var(--amber-soft)' }}>
                <DollarSign size={13} style={{ color: 'var(--amber)' }} />
              </span>
            </div>
            <p className="font-extrabold mt-2" style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--ink)' }}>
              ${(revenueBookedCents / 100).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Missed calls</span>
              <span className="w-6.5 h-6.5 rounded-lg flex items-center justify-center" style={{ background: missed === 0 ? 'var(--signal-soft)' : 'var(--coral-soft)' }}>
                {missed === 0
                  ? <CheckCircle2 size={13} style={{ color: 'var(--signal)' }} />
                  : <AlertCircle  size={13} style={{ color: 'var(--coral)' }} />}
              </span>
            </div>
            <p className="font-extrabold mt-2" style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: missed === 0 ? 'var(--signal)' : 'var(--coral)' }}>
              {missed}
            </p>
          </div>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: '1.9fr 1fr' }}>
          {/* Recent calls */}
          <section className="rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
              <div>
                <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Today&apos;s calls</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Every call recorded and transcribed</p>
              </div>
              <Link href="/calls" className="text-sm font-semibold" style={{ color: 'var(--violet)' }}>View all calls →</Link>
            </div>

            <div className="p-3 flex flex-col gap-2">
              {todayCalls.length === 0 ? (
                <div className="py-16 text-center rounded-xl flex flex-col items-center gap-3" style={{ background: 'var(--paper)' }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--violet-soft)' }}>
                    <Phone size={20} style={{ color: 'var(--violet)' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>No calls yet today</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>Ellie is ready and waiting</p>
                  </div>
                </div>
              ) : (
                todayCalls.map(call => {
                  const badge    = getBadge(call.endedReason)
                  const isMissed = call.endedReason === 'customer-did-not-answer'
                  const time     = call.startedAt
                    ? new Date(call.startedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
                    : '—'
                  return (
                    <TodayCallRow
                      key={call.id}
                      id={call.id}
                      time={time}
                      summary={call.analysis?.summary}
                      badgeLabel={badge.label}
                      badgeColor={badge.color}
                      badgeBg={badge.bg}
                      badgeBorder={badge.border}
                      recordingUrl={call.artifact?.recordingUrl}
                      hasTranscript={!!call.artifact?.transcript}
                      isMissed={isMissed}
                      customerNumber={call.customer?.number}
                    />
                  )
                })
              )}
            </div>
          </section>

          {/* Right rail */}
          <div className="flex flex-col gap-4">
            {/* Booked by Ellie */}
            <section className="rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
              <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
                <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Booked by Ellie</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                  {todayAppts.length} appointment{todayAppts.length !== 1 ? 's' : ''} today
                </p>
              </div>
              {todayAppts.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Nothing booked for today yet</p>
                </div>
              ) : (
                (todayAppts as Appointment[]).map((appt, i) => {
                  const t = new Date(appt.scheduled_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
                  const style = STATUS_APPT[appt.status] ?? STATUS_APPT.pending
                  return (
                    <div key={appt.id} className="flex items-center gap-3 px-5 py-3"
                      style={{ borderTop: i > 0 ? '1px solid var(--line)' : undefined }}>
                      <span className="text-xs font-mono font-bold shrink-0" style={{ color: 'var(--violet)', minWidth: 46 }}>{t}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{appt.customer_name}</p>
                        {appt.service && <p className="text-xs truncate mt-0.5" style={{ color: 'var(--ink-3)' }}>{appt.service}</p>}
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-full shrink-0 font-semibold capitalize"
                        style={{ color: style.color, background: style.bg, border: `1px solid ${style.border}` }}>
                        {appt.status}
                      </span>
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
                Ellie has answered <b className="text-white">{answered}</b> call{answered !== 1 ? 's' : ''} today
                {booked > 0 && <> and booked <b className="text-white">{booked}</b> appointment{booked !== 1 ? 's' : ''}</>}
                {missed > 0
                  ? <> — <b className="text-white">{missed}</b> went unanswered and may need a follow-up.</>
                  : <>. Nothing needs your attention.</>}
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
