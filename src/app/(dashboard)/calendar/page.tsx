import { createClient } from '@/lib/supabase/server'
import { getCalls } from '@/lib/vapi'
import CalendarView from '@/components/CalendarView'
import TodayCallRow from '@/components/TodayCallRow'

const BADGES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  'appointment-scheduled':   { label: 'Booked',      color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.25)'  },
  'customer-ended-call':     { label: 'Ended',       color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.2)'   },
  'assistant-ended-call':    { label: 'Completed',   color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)'  },
  'call-transferred':        { label: 'Transferred', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.25)'  },
  'customer-did-not-answer': { label: 'Missed',      color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)' },
  'voicemail':               { label: 'Voicemail',   color: '#fb923c', bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.25)'  },
}

function getBadge(reason?: string) {
  if (reason && BADGES[reason]) return BADGES[reason]
  if (!reason) return { label: 'Completed', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)' }
  return { label: 'Info', color: '#94a3b8', bg: 'rgba(148,163,184,0.07)', border: 'rgba(148,163,184,0.18)' }
}

type Appointment = {
  id: string
  customer_name: string
  customer_phone?: string
  service?: string
  scheduled_at: string
  status: string
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const todayStr     = new Date().toISOString().slice(0, 10)
  const selectedDate = date ?? todayStr

  const parts     = selectedDate.split('-').map(Number)
  const viewYear  = parts[0]
  const viewMonth = parts[1] - 1  // 0-indexed
  const month     = parts[1]      // 1-indexed

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: biz } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', user?.id)
    .single()

  const monthStart  = `${viewYear}-${String(month).padStart(2, '0')}-01T00:00:00`
  const nextY       = month === 12 ? viewYear + 1 : viewYear
  const nextM       = month === 12 ? 1 : month + 1
  const monthEnd    = `${nextY}-${String(nextM).padStart(2, '0')}-01T00:00:00`

  const { data: allAppts } = await supabase
    .from('appointments')
    .select('*')
    .eq('business_id', biz?.id)
    .order('scheduled_at', { ascending: true })

  const msStart = new Date(monthStart).getTime()
  const msEnd   = new Date(monthEnd).getTime()
  const monthAppts = (allAppts ?? []).filter(a => {
    const t = new Date(a.scheduled_at).getTime()
    return t >= msStart && t < msEnd
  })

  let allCalls: Awaited<ReturnType<typeof getCalls>> = []
  if (biz?.vapi_assistant_id) {
    try { allCalls = await getCalls(biz.vapi_assistant_id, 300) } catch (err) { console.error('Failed to fetch calls from Vapi:', err) }
  }

  const monthPrefix = `${viewYear}-${String(month).padStart(2, '0')}`
  const monthCalls  = allCalls.filter(c => c.startedAt?.startsWith(monthPrefix))

  const appointmentDates = [...new Set((monthAppts ?? []).map((a: Appointment) => a.scheduled_at.slice(0, 10)))]
  const missedCallDates  = [...new Set(
    monthCalls
      .filter(c => c.endedReason === 'customer-did-not-answer')
      .map(c => c.startedAt!.slice(0, 10))
  )]

  const selDayStart = new Date(selectedDate + 'T00:00:00').getTime()
  const selDayEnd   = new Date(selectedDate + 'T23:59:59.999').getTime()

  const dayAppts = monthAppts.filter((a: Appointment) => {
    const t = new Date(a.scheduled_at).getTime()
    return t >= selDayStart && t <= selDayEnd
  })
  const dayCalls = monthCalls.filter(c => {
    if (!c.startedAt) return false
    const t = new Date(c.startedAt).getTime()
    return t >= selDayStart && t <= selDayEnd
  })

  const dayLabel = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const isToday = selectedDate === todayStr

  return (
    <div className="flex h-full overflow-hidden">

      {/* Left panel: mini calendar */}
      <div className="w-72 shrink-0 overflow-y-auto"
        style={{ borderRight: '1px solid var(--b2)', background: 'var(--bg2)' }}>
        <CalendarView
          selectedDate={selectedDate}
          viewYear={viewYear}
          viewMonth={viewMonth}
          appointmentDates={appointmentDates}
          missedCallDates={missedCallDates}
        />
      </div>

      {/* Right panel: day detail */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-6">

          {/* Day header */}
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
              {isToday ? 'Today' : new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--t5)' }}>
              {isToday ? dayLabel : new Date(selectedDate + 'T12:00:00').getFullYear()}
            </p>
          </div>

          {/* Appointments */}
          <section>
            <h2 className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: 'var(--t5)' }}>
              Appointments{dayAppts.length > 0 ? ` · ${dayAppts.length}` : ''}
            </h2>
            {dayAppts.length === 0 ? (
              <div className="py-10 text-center rounded-xl"
                style={{ background: 'var(--b6)', border: '1px solid var(--b3)' }}>
                <p className="text-sm" style={{ color: 'var(--t5)' }}>No appointments this day</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {(dayAppts as Appointment[]).map(appt => {
                  const t = new Date(appt.scheduled_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
                  return (
                    <div key={appt.id} className="flex items-center gap-4 px-4 py-3 rounded-xl"
                      style={{ background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.12)' }}>
                      <span className="text-xs font-mono font-semibold shrink-0 tabular-nums"
                        style={{ color: '#a78bfa', minWidth: 44 }}>
                        {t}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                          {appt.customer_name}
                        </p>
                        {appt.service && (
                          <p className="text-xs truncate" style={{ color: 'var(--t4)' }}>{appt.service}</p>
                        )}
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-full shrink-0 font-semibold capitalize"
                        style={{
                          background: appt.status === 'confirmed' ? 'rgba(52,211,153,0.08)' : 'rgba(148,163,184,0.07)',
                          color: appt.status === 'confirmed' ? '#34d399' : '#94a3b8',
                          border: appt.status === 'confirmed' ? '1px solid rgba(52,211,153,0.2)' : '1px solid rgba(148,163,184,0.15)',
                        }}>
                        {appt.status}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Calls */}
          <section>
            <h2 className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: 'var(--t5)' }}>
              Calls{dayCalls.length > 0 ? ` · ${dayCalls.length}` : ''}
            </h2>
            {dayCalls.length === 0 ? (
              <div className="py-10 text-center rounded-xl"
                style={{ background: 'var(--b6)', border: '1px solid var(--b3)' }}>
                <p className="text-sm" style={{ color: 'var(--t5)' }}>No calls this day</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {dayCalls.map(call => {
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
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
