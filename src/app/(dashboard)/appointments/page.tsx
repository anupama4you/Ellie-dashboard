import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { localDateStr } from '@/lib/dates'
import { getValidAccessToken, listEvents } from '@/lib/googleCalendar'
import { CalendarDays, Clock, User, Phone, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  confirmed:   { color: 'var(--signal)', bg: 'var(--signal-soft)', border: 'rgba(15,163,122,0.2)'  },
  pending:     { color: 'var(--amber)',  bg: 'var(--amber-soft)',  border: 'rgba(217,138,11,0.2)'  },
  cancelled:   { color: 'var(--coral)',  bg: 'var(--coral-soft)',  border: 'rgba(221,81,64,0.2)'   },
  completed:   { color: 'var(--violet)', bg: 'var(--violet-soft)', border: 'rgba(109,74,255,0.2)'  },
  rescheduled: { color: 'var(--violet)', bg: 'var(--violet-soft)', border: 'rgba(109,74,255,0.2)'  },
}

type Appointment = {
  id: string
  customer_name: string
  customer_phone?: string
  service?: string
  scheduled_at: string
  status: string
}

const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

function startOfWeek(d: Date) {
  const day  = d.getDay() // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

const toDateStr = localDateStr

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const todayStr     = toDateStr(new Date())
  const selectedDate = date ?? todayStr
  const selected     = new Date(selectedDate + 'T12:00:00')

  const weekStart = startOfWeek(selected)
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
  const weekEnd = new Date(weekDates[6])
  weekEnd.setHours(23, 59, 59, 999)

  const prevWeekDate = new Date(selected); prevWeekDate.setDate(prevWeekDate.getDate() - 7)
  const nextWeekDate = new Date(selected); nextWeekDate.setDate(nextWeekDate.getDate() + 7)

  const { business: biz } = await getCurrentBusiness()
  const supabase = await createClient()

  const { data: appointments } = await supabase
    .from('appointments')
    .select('*')
    .eq('business_id', biz?.id)
    .order('scheduled_at', { ascending: true })

  const weekAppts = ((appointments ?? []) as Appointment[]).filter(a => {
    const t = new Date(a.scheduled_at)
    return t >= weekDates[0] && t <= weekEnd && a.status !== 'cancelled'
  })

  // Merge in the connected Google Calendar (if any) so staff see everything —
  // Ellie's bookings alongside anything booked directly in their own calendar.
  type GoogleEvent = { id: string; title: string; start: Date; htmlLink?: string }
  let weekGoogleEvents: GoogleEvent[] = []
  if (biz) {
    try {
      const google = await getValidAccessToken(supabase, biz.id)
      if (google) {
        const events = await listEvents(google.accessToken, google.calendarId, weekDates[0], weekEnd)
        weekGoogleEvents = events
          .filter(e => e.start?.dateTime)
          .map(e => ({ id: e.id, title: e.summary ?? 'Untitled event', start: new Date(e.start!.dateTime!), htmlLink: e.htmlLink }))
      }
    } catch (err) {
      console.error('Failed to load Google Calendar events:', err)
    }
  }

  const countByDay = new Map<string, number>()
  for (const a of weekAppts) {
    const key = localDateStr(new Date(a.scheduled_at))
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1)
  }
  for (const e of weekGoogleEvents) {
    const key = localDateStr(e.start)
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1)
  }

  const dayAppts = weekAppts
    .filter(a => localDateStr(new Date(a.scheduled_at)) === selectedDate)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))

  const dayGoogleEvents = weekGoogleEvents
    .filter(e => localDateStr(e.start) === selectedDate)
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const dayTitle = selected.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1220px] mx-auto flex flex-col gap-4">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--ink)' }}>
              Appointments
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>Everything Ellie has booked into your calendar</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/appointments?date=${toDateStr(prevWeekDate)}`}
              className="w-8 h-8 rounded-lg flex items-center justify-center btn-ghost"
              style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}
            >
              <ChevronLeft size={15} />
            </Link>
            <Link
              href={`/appointments?date=${todayStr}`}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold btn-ghost"
              style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}
            >
              This week
            </Link>
            <Link
              href={`/appointments?date=${toDateStr(nextWeekDate)}`}
              className="w-8 h-8 rounded-lg flex items-center justify-center btn-ghost"
              style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}
            >
              <ChevronRight size={15} />
            </Link>
          </div>
        </div>

        {/* Week strip */}
        <div className="grid grid-cols-7 gap-2.5">
          {weekDates.map((d, i) => {
            const dStr    = toDateStr(d)
            const count   = countByDay.get(dStr) ?? 0
            const isSel   = dStr === selectedDate
            const isToday = dStr === todayStr
            return (
              <Link
                key={dStr}
                href={`/appointments?date=${dStr}`}
                className="rounded-xl p-3 text-center transition-colors"
                style={{
                  background: 'var(--card)',
                  border: isSel ? '1px solid var(--violet)' : '1px solid var(--line)',
                  boxShadow: isSel ? '0 0 0 3px var(--violet-soft)' : 'var(--shadow)',
                }}
              >
                <div className="text-[0.64rem] font-bold tracking-widest" style={{ color: 'var(--ink-3)' }}>{DOW[i]}</div>
                <div className="font-extrabold text-xl mt-0.5 mb-1" style={{ fontFamily: 'var(--font-display)', color: isToday ? 'var(--violet)' : 'var(--ink)' }}>
                  {d.getDate()}
                </div>
                <span
                  className="text-xs font-bold rounded-full px-2 py-0.5 inline-block"
                  style={count > 0
                    ? { color: 'var(--violet)', background: 'var(--violet-soft)' }
                    : { color: 'var(--ink-3)', background: 'var(--paper)' }}
                >
                  {count}
                </span>
              </Link>
            )
          })}
        </div>

        {/* Day detail */}
        <section className="rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
          <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
            <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
              {selectedDate === todayStr ? 'Today' : dayTitle}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
              {dayAppts.length + dayGoogleEvents.length} item{dayAppts.length + dayGoogleEvents.length !== 1 ? 's' : ''}
              {dayGoogleEvents.length > 0 && ` · ${dayGoogleEvents.length} from your calendar`}
            </p>
          </div>

          {dayAppts.length === 0 && dayGoogleEvents.length === 0 ? (
            <div className="py-14 text-center flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'var(--paper)' }}>
                <CalendarDays size={18} style={{ color: 'var(--ink-3)' }} />
              </div>
              <p className="text-sm" style={{ color: 'var(--ink-3)' }}>No appointments this day</p>
            </div>
          ) : (
            [
              ...dayAppts.map(a => ({ kind: 'appointment' as const, time: new Date(a.scheduled_at), appt: a })),
              ...dayGoogleEvents.map(e => ({ kind: 'google' as const, time: e.start, event: e })),
            ]
              .sort((a, b) => a.time.getTime() - b.time.getTime())
              .map((item, i) => {
                if (item.kind === 'google') {
                  const e = item.event
                  return (
                    <div
                      key={`g-${e.id}`}
                      className="flex items-center gap-4 px-5 py-4 transition-colors"
                      style={{ borderTop: i > 0 ? '1px solid var(--line)' : undefined }}
                    >
                      <div className="flex items-center gap-1.5 shrink-0" style={{ width: 70, color: 'var(--ink)' }}>
                        <Clock size={12} style={{ color: 'var(--ink-3)' }} />
                        <span className="text-sm font-mono font-semibold">
                          {e.start.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--paper)' }}>
                        <CalendarDays size={14} style={{ color: 'var(--ink-3)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{e.title}</div>
                        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>From your calendar</span>
                      </div>
                      {e.htmlLink && (
                        <a href={e.htmlLink} target="_blank" rel="noopener noreferrer"
                          className="w-8 h-8 rounded-lg flex items-center justify-center btn-ghost shrink-0"
                          style={{ color: 'var(--ink-3)' }} title="Open in Google Calendar">
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  )
                }

                const appt  = item.appt
                const style = STATUS_STYLE[appt.status] ?? STATUS_STYLE.pending
                const t     = item.time
                return (
                  <div
                    key={appt.id}
                    className="flex items-center gap-4 px-5 py-4 hover-row transition-colors"
                    style={{ borderTop: i > 0 ? '1px solid var(--line)' : undefined }}
                  >
                    <div className="flex items-center gap-1.5 shrink-0" style={{ width: 70, color: 'var(--ink)' }}>
                      <Clock size={12} style={{ color: 'var(--violet)' }} />
                      <span className="text-sm font-mono font-semibold">
                        {t.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: 'var(--violet-soft)' }}
                    >
                      <User size={14} style={{ color: 'var(--violet)' }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{appt.customer_name}</div>
                      <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
                        {appt.customer_phone && (
                          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--ink-3)' }}>
                            <Phone size={10} /> {appt.customer_phone}
                          </span>
                        )}
                        {appt.service && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: 'var(--violet-soft)', color: 'var(--violet)' }}
                          >
                            {appt.service}
                          </span>
                        )}
                      </div>
                    </div>

                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize whitespace-nowrap shrink-0"
                      style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
                    >
                      {appt.status}
                    </span>
                  </div>
                )
              })
          )}
        </section>
      </div>
    </div>
  )
}
