import { createClient } from '@/lib/supabase/server'
import { getCalls } from '@/lib/vapi'
import TodayCallRow from '@/components/TodayCallRow'
import { Phone, CalendarDays, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react'

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
  const low = reason.toLowerCase()
  if (low.includes('error')) return { label: 'Error', color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' }
  return { label: 'Info', color: '#94a3b8', bg: 'rgba(148,163,184,0.07)', border: 'rgba(148,163,184,0.18)' }
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
  confirmed:   { color: '#34d399', bg: 'rgba(52,211,153,0.1)',   border: 'rgba(52,211,153,0.22)'   },
  pending:     { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.2)'    },
  cancelled:   { color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)'   },
  completed:   { color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)'   },
  rescheduled: { color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.2)'    },
}

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

  const todayAppts = (allAppts ?? []).filter(a => {
    const d = new Date(a.scheduled_at)
    return d >= dayStart && d <= dayEnd && a.status !== 'cancelled'
  })

  let allCalls: Awaited<ReturnType<typeof getCalls>> = []
  if (biz?.vapi_assistant_id) {
    try { allCalls = await getCalls(biz.vapi_assistant_id, 100) } catch (err) { console.error('Failed to fetch calls from Vapi:', err) }
  }
  const todayCalls = allCalls.filter(c => {
    if (!c.startedAt) return false
    const d = new Date(c.startedAt)
    return d >= dayStart && d <= dayEnd
  })

  const answered = todayCalls.filter(c => c.endedReason !== 'customer-did-not-answer').length
  const booked   = todayAppts.length
  const missed   = todayCalls.filter(c => c.endedReason === 'customer-did-not-answer').length

  const dateLabel = now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-3xl mx-auto flex flex-col gap-7">

        {/* Greeting */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} style={{ color: '#a78bfa' }} />
              <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--t4)' }}>
                {dateLabel}
              </p>
            </div>
            <h1 className="text-[26px] font-bold leading-tight" style={{ color: 'var(--text)' }}>
              {getGreeting(hour)},{' '}
              <span className="gradient-text">{biz?.name ?? 'there'}</span>
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--t4)' }}>
              Here&apos;s how Ellie is doing today.
            </p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-3">
          {/* Calls answered */}
          <div className="stat-card">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--t4)' }}>
                Answered
              </span>
              <div
                className="icon-badge"
                style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.18)' }}
              >
                <Phone size={14} style={{ color: '#a78bfa' }} />
              </div>
            </div>
            <div>
              <p className="text-3xl font-bold tabular-nums" style={{ color: 'var(--text)' }}>{answered}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--t4)' }}>
                call{answered !== 1 ? 's' : ''} handled
              </p>
            </div>
          </div>

          {/* Booked */}
          <div className="stat-card">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--t4)' }}>
                Booked
              </span>
              <div
                className="icon-badge"
                style={{ background: 'rgba(244,114,182,0.1)', border: '1px solid rgba(244,114,182,0.18)' }}
              >
                <CalendarDays size={14} style={{ color: '#f472b6' }} />
              </div>
            </div>
            <div>
              <p className="text-3xl font-bold tabular-nums" style={{ color: 'var(--text)' }}>{booked}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--t4)' }}>
                appointment{booked !== 1 ? 's' : ''} today
              </p>
            </div>
          </div>

          {/* Missed */}
          <div className="stat-card">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--t4)' }}>
                Missed
              </span>
              <div
                className="icon-badge"
                style={{
                  background: missed === 0 ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                  border: `1px solid ${missed === 0 ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.18)'}`,
                }}
              >
                {missed === 0
                  ? <CheckCircle2 size={14} style={{ color: '#34d399' }} />
                  : <AlertCircle  size={14} style={{ color: '#f87171' }} />
                }
              </div>
            </div>
            <div>
              <p
                className="text-3xl font-bold tabular-nums"
                style={{ color: missed === 0 ? '#34d399' : '#f87171' }}
              >
                {missed}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--t4)' }}>
                {missed === 0 ? 'perfect score!' : `call${missed !== 1 ? 's' : ''} to follow up`}
              </p>
            </div>
          </div>
        </div>

        {/* Coming up today */}
        {todayAppts.length > 0 && (
          <section className="flex flex-col gap-3">
            <p className="section-label">Coming Up Today</p>
            <div className="card">
              {(todayAppts as Appointment[]).map((appt, i) => {
                const t = new Date(appt.scheduled_at).toLocaleTimeString('en-AU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
                const style = STATUS_APPT[appt.status] ?? STATUS_APPT.pending
                return (
                  <div
                    key={appt.id}
                    className="flex items-center gap-4 px-5 py-3.5 hover-row transition-colors"
                    style={i > 0 ? { borderTop: '1px solid var(--b3)' } : undefined}
                  >
                    {/* Time */}
                    <span
                      className="text-xs font-mono font-bold shrink-0 tabular-nums"
                      style={{ color: '#a78bfa', minWidth: 46 }}
                    >
                      {t}
                    </span>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                        {appt.customer_name}
                      </p>
                      {appt.service && (
                        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--t4)' }}>
                          {appt.service}
                        </p>
                      )}
                    </div>

                    {/* Status badge */}
                    <span
                      className="text-xs px-2.5 py-1 rounded-full shrink-0 font-semibold capitalize"
                      style={{ color: style.color, background: style.bg, border: `1px solid ${style.border}` }}
                    >
                      {appt.status}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Today's calls */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="section-label">Today&apos;s Calls</p>
            {todayCalls.length > 0 && (
              <span
                className="text-xs px-2.5 py-1 rounded-full font-semibold"
                style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)', color: '#a78bfa' }}
              >
                {todayCalls.length} call{todayCalls.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {todayCalls.length === 0 ? (
            <div
              className="py-16 text-center rounded-2xl flex flex-col items-center gap-3"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.12)' }}
              >
                <Phone size={20} style={{ color: 'var(--t4)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--t3)' }}>No calls yet today</p>
                <p className="text-xs mt-1" style={{ color: 'var(--t5)' }}>Ellie is ready and waiting</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {todayCalls.map(call => {
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
  )
}
