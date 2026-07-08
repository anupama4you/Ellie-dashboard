import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { dateStrInZone, zonedTimeToUtc, shiftDateStr, formatInZone } from '@/lib/timezone'
import { getValidAccessToken, listEvents } from '@/lib/googleCalendar'
import CopyButton from '@/components/CopyButton'
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
  notes?: string | null
  calendar_event_id?: string | null
  calendar_event_link?: string | null
}

const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

/** Monday of the week containing `dateStr` (YYYY-MM-DD) — pure calendar-date arithmetic, no timezone conversion needed once we already have a Y-M-D. */
function startOfWeekStr(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay() // 0=Sun..6=Sat
  return shiftDateStr(dateStr, dow === 0 ? -6 : 1 - dow)
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const { business: biz } = await getCurrentBusiness()
  const timeZone = biz?.timezone ?? 'Australia/Adelaide'
  const supabase = await createClient()

  const todayStr     = dateStrInZone(new Date(), timeZone)
  const selectedDate = date ?? todayStr

  const weekStartStr = startOfWeekStr(selectedDate)
  const weekDateStrs = Array.from({ length: 7 }, (_, i) => shiftDateStr(weekStartStr, i))
  const weekEndStr    = weekDateStrs[6]

  const [wy, wmo, wd] = weekStartStr.split('-').map(Number)
  const weekRangeStart = zonedTimeToUtc(timeZone, wy, wmo, wd, 0, 0)
  const [ey, emo, ed] = weekEndStr.split('-').map(Number)
  const weekRangeEnd = new Date(zonedTimeToUtc(timeZone, ey, emo, ed, 0, 0).getTime() + 24 * 60 * 60_000 - 1)

  const prevWeekDateStr = shiftDateStr(selectedDate, -7)
  const nextWeekDateStr = shiftDateStr(selectedDate, 7)

  // Scoped to the displayed week only — this used to fetch the business's
  // entire appointment history on every visit, which only gets slower as
  // bookings accumulate over months/years.
  const { data: appointments } = await supabase
    .from('appointments')
    .select('*')
    .eq('business_id', biz?.id)
    .neq('status', 'cancelled')
    .gte('scheduled_at', weekRangeStart.toISOString())
    .lte('scheduled_at', weekRangeEnd.toISOString())
    .order('scheduled_at', { ascending: true })

  const weekAppts = (appointments ?? []) as Appointment[]

  // Merge in the connected Google Calendar (if any) so staff see everything —
  // Ellie's bookings alongside anything booked directly in their own calendar.
  type GoogleEvent = { id: string; title: string; start: Date; htmlLink?: string }
  let weekGoogleEvents: GoogleEvent[] = []
  if (biz) {
    try {
      const google = await getValidAccessToken(supabase, biz.id)
      if (google) {
        // Bookings we made ourselves already created this exact event — don't show it twice.
        const ownEventIds = new Set(weekAppts.map(a => a.calendar_event_id).filter(Boolean))
        const events = await listEvents(google.accessToken, google.calendarId, weekRangeStart, weekRangeEnd)
        weekGoogleEvents = events
          .filter(e => e.start?.dateTime && !ownEventIds.has(e.id))
          .map(e => ({ id: e.id, title: e.summary ?? 'Untitled event', start: new Date(e.start!.dateTime!), htmlLink: e.htmlLink }))
      }
    } catch (err) {
      console.error('Failed to load Google Calendar events:', err)
    }
  }

  const countByDay = new Map<string, number>()
  for (const a of weekAppts) {
    const key = dateStrInZone(new Date(a.scheduled_at), timeZone)
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1)
  }
  for (const e of weekGoogleEvents) {
    const key = dateStrInZone(e.start, timeZone)
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1)
  }

  const dayAppts = weekAppts
    .filter(a => dateStrInZone(new Date(a.scheduled_at), timeZone) === selectedDate)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))

  const dayGoogleEvents = weekGoogleEvents
    .filter(e => dateStrInZone(e.start, timeZone) === selectedDate)
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const [sy, smo, sd] = selectedDate.split('-').map(Number)
  const dayTitle = formatInZone(new Date(Date.UTC(sy, smo - 1, sd, 12)), 'UTC', { weekday: 'long', day: 'numeric', month: 'long' })

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
              href={`/appointments?date=${prevWeekDateStr}`}
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
              href={`/appointments?date=${nextWeekDateStr}`}
              className="w-8 h-8 rounded-lg flex items-center justify-center btn-ghost"
              style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}
            >
              <ChevronRight size={15} />
            </Link>
          </div>
        </div>

        {/* Week strip */}
        <div className="grid grid-cols-7 gap-2.5">
          {weekDateStrs.map((dStr, i) => {
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
                  {Number(dStr.split('-')[2])}
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
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
              {selectedDate === todayStr ? 'Today' : dayTitle}
            </h2>
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
              {dayAppts.length + dayGoogleEvents.length} item{dayAppts.length + dayGoogleEvents.length !== 1 ? 's' : ''}
              {dayGoogleEvents.length > 0 && ` · ${dayGoogleEvents.length} from your calendar`}
            </p>
          </div>

          {dayAppts.length === 0 && dayGoogleEvents.length === 0 ? (
            <div
              className="py-14 text-center flex flex-col items-center gap-2 rounded-2xl"
              style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}
            >
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'var(--paper)' }}>
                <CalendarDays size={18} style={{ color: 'var(--ink-3)' }} />
              </div>
              <p className="text-sm" style={{ color: 'var(--ink-3)' }}>No appointments this day</p>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {[
                ...dayAppts.map(a => ({ kind: 'appointment' as const, time: new Date(a.scheduled_at), appt: a })),
                ...dayGoogleEvents.map(e => ({ kind: 'google' as const, time: e.start, event: e })),
              ]
                .sort((a, b) => a.time.getTime() - b.time.getTime())
                .map(item => {
                  if (item.kind === 'google') {
                    const e = item.event
                    return (
                      <div
                        key={`g-${e.id}`}
                        className="rounded-2xl p-4 flex flex-col gap-3"
                        style={{ background: 'var(--card)', border: '1px dashed var(--line)' }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5" style={{ color: 'var(--ink-3)' }}>
                            <Clock size={12} />
                            <span className="text-sm font-mono font-semibold">
                              {formatInZone(e.start, timeZone, { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                            style={{ background: 'var(--paper)', color: 'var(--ink-3)' }}>
                            From your calendar
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--paper)' }}>
                            <CalendarDays size={14} style={{ color: 'var(--ink-3)' }} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{e.title}</div>
                          </div>
                        </div>

                        {e.htmlLink && (
                          <a href={e.htmlLink} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs font-semibold w-fit"
                            style={{ color: 'var(--violet)' }}>
                            <ExternalLink size={11} /> Open in Google Calendar
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
                      className="rounded-2xl p-4 flex flex-col gap-3"
                      style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5" style={{ color: 'var(--violet)' }}>
                          <Clock size={12} />
                          <span className="text-sm font-mono font-semibold">
                            {formatInZone(t, timeZone, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <span
                          className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize whitespace-nowrap"
                          style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
                        >
                          {appt.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--violet-soft)' }}>
                          <User size={14} style={{ color: 'var(--violet)' }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{appt.customer_name}</div>
                          {appt.customer_phone && (
                            <div className="flex items-center gap-1 mt-0.5" style={{ color: 'var(--ink-3)' }}>
                              <Phone size={10} className="shrink-0" />
                              <span className="text-xs truncate">{appt.customer_phone}</span>
                              <CopyButton text={appt.customer_phone} />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        {appt.service ? (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full truncate"
                            style={{ background: 'var(--violet-soft)', color: 'var(--violet)' }}
                          >
                            {appt.service}
                          </span>
                        ) : <span />}

                        {appt.calendar_event_link && (
                          <a href={appt.calendar_event_link} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs font-semibold shrink-0"
                            style={{ color: 'var(--ink-3)' }} title="Open in Google Calendar">
                            <ExternalLink size={11} /> Calendar
                          </a>
                        )}
                      </div>

                      {appt.notes && (
                        <p className="text-xs leading-relaxed px-2.5 py-2 rounded-lg" style={{ background: 'var(--paper)', color: 'var(--ink-2)' }}>
                          {appt.notes}
                        </p>
                      )}
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
