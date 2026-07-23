import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { dateStrInZone, zonedTimeToUtc, shiftDateStr, formatInZone } from '@/lib/timezone'
import { isAfterHours } from '@/lib/availability'
import { getValidAccessToken, listEvents } from '@/lib/googleCalendar'
import type { Hours } from '../briefing/actions'
import CopyButton from '@/components/CopyButton'
import AddAppointmentModal from '@/components/AddAppointmentModal'
import AppointmentActions from '@/components/AppointmentActions'
import { CalendarDays, Phone, ChevronLeft, ChevronRight, ExternalLink, CalendarSync } from 'lucide-react'

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
  vapi_call_id?: string | null
}

const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const HOURS_DAY_KEYS: (keyof Hours)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** Monday of the week containing `dateStr` (YYYY-MM-DD) — pure calendar-date arithmetic, no timezone conversion needed once we already have a Y-M-D. */
function startOfWeekStr(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay() // 0=Sun..6=Sat
  return shiftDateStr(dateStr, dow === 0 ? -6 : 1 - dow)
}

function dowIndex(dateStr: string): number {
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay() // 0=Sun..6=Sat
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
  const bizHours = (biz?.hours as Hours | undefined) ?? null

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
  const [{ data: appointments }, { data: servicesRaw }] = await Promise.all([
    supabase
      .from('appointments')
      .select('*')
      .eq('business_id', biz?.id)
      .neq('status', 'cancelled')
      .gte('scheduled_at', weekRangeStart.toISOString())
      .lte('scheduled_at', weekRangeEnd.toISOString())
      .order('scheduled_at', { ascending: true }),
    supabase.from('business_services').select('name, duration_minutes, price_cents').eq('business_id', biz?.id),
  ])

  const weekAppts = (appointments ?? []) as Appointment[]
  const services  = servicesRaw ?? []
  const serviceByName = new Map(services.map(s => [s.name.toLowerCase(), s]))

  // Calls that resulted in one of this week's Ellie-booked appointments, so
  // each appointment can link back to "when the caller actually booked this".
  const bookingCallIds = Array.from(new Set(weekAppts.map(a => a.vapi_call_id).filter((id): id is string => !!id)))
  const callInfoByVapiId = new Map<string, { id: string; startedAt: string | null }>()
  if (biz && bookingCallIds.length > 0) {
    const { data: bookingCalls } = await supabase
      .from('calls')
      .select('id, vapi_call_id, started_at')
      .eq('business_id', biz.id)
      .in('vapi_call_id', bookingCallIds)
    for (const c of bookingCalls ?? []) {
      callInfoByVapiId.set(c.vapi_call_id, { id: c.id, startedAt: c.started_at })
    }
  }

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

  const bookedByEllieCount = dayAppts.filter(a => !!a.vapi_call_id).length

  const [sy, smo, sd] = selectedDate.split('-').map(Number)
  const dayTitle = formatInZone(new Date(Date.UTC(sy, smo - 1, sd, 12)), 'UTC', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1220px] mx-auto flex flex-col gap-4">

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--ink)' }}>
              Appointments
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>Everything Ellie has booked into your calendar</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
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
            <Link
              href="/settings"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ border: '1px solid var(--line)', color: 'var(--ink-2)', background: 'var(--card)' }}
            >
              <CalendarSync size={14} />
              Sync with Google Calendar
            </Link>
            {biz && (
              <AddAppointmentModal
                defaultDate={selectedDate}
                services={services.map(s => ({ name: s.name, durationMinutes: s.duration_minutes, priceCents: s.price_cents }))}
              />
            )}
          </div>
        </div>

        {/* Week strip */}
        <div className="grid grid-cols-7 gap-2.5">
          {weekDateStrs.map((dStr, i) => {
            const count    = countByDay.get(dStr) ?? 0
            const isSel    = dStr === selectedDate
            const isToday  = dStr === todayStr
            const dayOpen  = bizHours ? bizHours[HOURS_DAY_KEYS[dowIndex(dStr)]]?.open : true
            const closed   = bizHours ? !dayOpen : false
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
                  className="text-xs font-bold rounded-full px-2 py-0.5 inline-block whitespace-nowrap"
                  style={closed
                    ? { color: 'var(--ink-3)', background: 'var(--paper)' }
                    : count > 0
                      ? { color: 'var(--violet)', background: 'var(--violet-soft)' }
                      : { color: 'var(--ink-3)', background: 'var(--paper)' }}
                >
                  {closed ? 'Closed' : count > 0 ? `${count} booked` : 'Open'}
                </span>
              </Link>
            )
          })}
        </div>

        {/* Day detail */}
        <div>
          <div className="flex items-baseline justify-between mb-3 flex-wrap gap-1">
            <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
              {selectedDate === todayStr ? 'Today' : dayTitle}
            </h2>
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
              {dayAppts.length} appointment{dayAppts.length !== 1 ? 's' : ''}
              {bookedByEllieCount > 0 && ` · ${bookedByEllieCount} booked by Ellie`}
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
            <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
              {[
                ...dayAppts.map(a => ({ kind: 'appointment' as const, time: new Date(a.scheduled_at), appt: a })),
                ...dayGoogleEvents.map(e => ({ kind: 'google' as const, time: e.start, event: e })),
              ]
                .sort((a, b) => a.time.getTime() - b.time.getTime())
                .map((item, i) => {
                  const rowStyle = { borderTop: i > 0 ? '1px solid var(--line)' : undefined }

                  if (item.kind === 'google') {
                    const e = item.event
                    return (
                      <div key={`g-${e.id}`} className="flex items-center gap-4 px-5 py-3.5" style={rowStyle}>
                        <span className="text-xs font-mono font-semibold shrink-0" style={{ color: 'var(--ink-3)', width: 62 }}>
                          {formatInZone(e.start, timeZone, { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{e.title}</p>
                          {e.htmlLink ? (
                            <a href={e.htmlLink} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs font-semibold w-fit mt-0.5" style={{ color: 'var(--ink-3)' }}>
                              <ExternalLink size={10} /> From your calendar
                            </a>
                          ) : (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>From your calendar</p>
                          )}
                        </div>
                      </div>
                    )
                  }

                  const appt   = item.appt
                  const style  = STATUS_STYLE[appt.status] ?? STATUS_STYLE.pending
                  const svc    = serviceByName.get(appt.service?.toLowerCase() ?? '')
                  const bits   = [
                    appt.service || null,
                    svc?.duration_minutes ? `${svc.duration_minutes} min` : null,
                    svc?.price_cents != null ? `$${(svc.price_cents / 100).toFixed(0)}` : null,
                  ].filter(Boolean)

                  const bookedByEllie = !!appt.vapi_call_id
                  const callInfo = appt.vapi_call_id ? callInfoByVapiId.get(appt.vapi_call_id) : undefined
                  let bookingLine: string | null = null
                  if (bookedByEllie) {
                    if (callInfo?.startedAt) {
                      const started = new Date(callInfo.startedAt)
                      bookingLine = isAfterHours(started, bizHours, timeZone)
                        ? 'Booked by Ellie · after-hours call'
                        : `Booked by Ellie · ${formatInZone(started, timeZone, { weekday: 'short' })} ${formatInZone(started, timeZone, { hour: 'numeric', minute: '2-digit' })} call`
                    } else {
                      bookingLine = 'Booked by Ellie'
                    }
                  }

                  return (
                    <div key={appt.id} className="flex items-center gap-4 px-5 py-3.5" style={rowStyle} title={appt.notes ?? undefined}>
                      <span className="text-xs font-mono font-semibold shrink-0" style={{ color: 'var(--ink)', width: 62 }}>
                        {formatInZone(item.time, timeZone, { hour: 'numeric', minute: '2-digit' })}
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{appt.customer_name}</p>
                          {appt.customer_phone && (
                            <span className="flex items-center gap-1 shrink-0" style={{ color: 'var(--ink-3)' }}>
                              <Phone size={9} />
                              <span className="text-xs">{appt.customer_phone}</span>
                              <CopyButton text={appt.customer_phone} />
                            </span>
                          )}
                        </div>
                        {bits.length > 0 && (
                          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--ink-3)' }}>{bits.join(' · ')}</p>
                        )}
                        {bookingLine ? (
                          <p className="text-xs font-semibold truncate mt-0.5 flex items-center gap-1" style={{ color: 'var(--violet)' }}>
                            {callInfo ? (
                              <Link href={`/calls/${callInfo.id}`} className="flex items-center gap-1 hover:underline">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--violet)' }} />
                                {bookingLine}
                              </Link>
                            ) : (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--violet)' }} />
                                {bookingLine}
                              </>
                            )}
                          </p>
                        ) : (
                          <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--ink-3)' }}>Booked by you</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {appt.calendar_event_link && (
                          <a href={appt.calendar_event_link} target="_blank" rel="noopener noreferrer"
                            className="w-7 h-7 rounded-lg flex items-center justify-center btn-ghost"
                            style={{ color: 'var(--ink-3)' }} title="Open in Google Calendar">
                            <ExternalLink size={12} />
                          </a>
                        )}
                        <span
                          className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize whitespace-nowrap"
                          style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
                        >
                          {appt.status}
                        </span>
                        {appt.status !== 'completed' && (
                          <AppointmentActions
                            appointmentId={appt.id}
                            customerName={appt.customer_name}
                            customerPhone={appt.customer_phone ?? null}
                            service={appt.service ?? null}
                            notes={appt.notes ?? null}
                            scheduledAt={appt.scheduled_at}
                            timeZone={timeZone}
                            services={services.map(s => ({ name: s.name }))}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
