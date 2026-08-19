import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendSms } from '@/lib/twilio'
import { phoneDigitsKey, toE164Au } from '@/lib/sms'
import { findNextAvailableSlots, formatSlot, durationFor, isWithinOpenHours, hasConflictingAppointment, DEFAULT_SLOT_COUNT } from '@/lib/availability'
import { classifyCall } from '@/lib/callClassify'
import { getValidAccessToken, freeBusyQuery, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '@/lib/googleCalendar'
import { formatInZone, dateStrInZone } from '@/lib/timezone'
import { mapsLink } from '@/lib/maps'
import { rememberCustomerName } from '@/lib/customers'
import { getPhoneNumber } from '@/lib/vapi'
import { lookupAddress } from '@/lib/addressr'
import { captureError } from '@/lib/monitoring'
import type { Hours } from '@/app/(dashboard)/briefing/actions'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Short-lived cache for the one genuinely slow, safely-cacheable step in
 * checkAvailability: the round trip to Google's free/busy API. A call often
 * asks checkAvailability three or four times in quick succession (different
 * staff, different day, "anything later?") — each one otherwise re-paying
 * that external network hop even though the answer can't realistically have
 * changed in the last few seconds. Local data (appointments, staff, services)
 * is deliberately NOT cached here — those reads are already fast (same
 * Supabase project) and freshness matters most for them, since they're what
 * actually prevents a double-booking. Keyed per business, process-local
 * (each warm serverless instance has its own — fine, since consecutive tool
 * calls within one live call almost always land on the same instance; a
 * cold/different instance just pays the round trip again, same as today).
 */
const FREE_BUSY_CACHE_TTL_MS = 30_000
const freeBusyCache = new Map<string, { expires: number; data: { start: Date; end: Date }[] }>()

async function getFreeBusy(bizId: string, now: Date, lookout: Date): Promise<{ start: Date; end: Date }[]> {
  const cached = freeBusyCache.get(bizId)
  if (cached && cached.expires > Date.now()) return cached.data

  try {
    const google = await getValidAccessToken(supabase, bizId)
    if (!google) return []
    const busy = await freeBusyQuery(google.accessToken, google.calendarId, now, lookout)
    const data = busy.map(b => ({ start: new Date(b.start), end: new Date(b.end) }))
    freeBusyCache.set(bizId, { expires: Date.now() + FREE_BUSY_CACHE_TTL_MS, data })
    return data
  } catch (calErr) {
    console.error('Google Calendar free/busy check failed — falling back to local availability only:', calErr)
    return []
  }
}

/** Call right after any successful Google Calendar mutation, so the next checkAvailability in the same call never offers a slot the call itself just filled or freed up. */
function invalidateFreeBusyCache(bizId: string): void {
  freeBusyCache.delete(bizId)
}

type ToolCall = {
  id: string
  name?: string
  arguments?: Record<string, unknown>
  function?: { name?: string; arguments?: Record<string, unknown> }
}

function toolName(toolCall: ToolCall): string | undefined {
  return toolCall.name ?? toolCall.function?.name
}

function toolArgs(toolCall: ToolCall): Record<string, unknown> {
  return toolCall.arguments ?? toolCall.function?.arguments ?? {}
}

function fmtDate(iso: string, timeZone: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return formatInZone(d, timeZone, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
}

type ResolvedStaff = { id: string; name: string; hours: Hours | null }

/** Case-insensitive lookup against the business's active roster — an unmatched/unresolved name is not an error, callers just fall through to unfiltered. */
async function resolveStaffMember(bizId: string, name: string | undefined): Promise<ResolvedStaff | null> {
  if (!name?.trim()) return null
  const { data } = await supabase.from('business_staff').select('id, name, active, hours').eq('business_id', bizId)
  const match = (data ?? []).find(s => s.active && s.name.toLowerCase() === name.trim().toLowerCase())
  return match ? { id: match.id, name: match.name, hours: match.hours as Hours | null } : null
}

/** For conflict-recovery paths that already know a `staff_id` (a reschedule on an already-assigned appointment) rather than a raw spoken name. */
async function getStaffById(bizId: string, staffId: string): Promise<ResolvedStaff | null> {
  const { data } = await supabase.from('business_staff').select('id, name, hours').eq('id', staffId).eq('business_id', bizId).single()
  return data ? { id: data.id, name: data.name, hours: data.hours as Hours | null } : null
}

/**
 * Shared by checkAvailability and bookAppointment's booking-conflict
 * recovery (two callers offered the same slot at once — see the unique
 * index on appointments(business_id, staff_id, scheduled_at)) — both need
 * the same "what's actually free right now" computation.
 */
async function computeAvailableSlots(
  biz: { id: string; hours: unknown; timezone: string },
  requestedService: string | undefined,
  requestedStaffMember?: string,
  requestedStaffId?: string | null,
  preferredDate?: string,
): Promise<{ slots: Date[]; resolvedStaffName: string | null }> {
  const [{ data: services }, resolvedStaff, { data: existing }, { data: activeRoster }] = await Promise.all([
    supabase.from('business_services').select('name, duration_minutes').eq('business_id', biz.id),
    requestedStaffId ? getStaffById(biz.id, requestedStaffId) : resolveStaffMember(biz.id, requestedStaffMember),
    supabase.from('appointments')
      .select('scheduled_at, service, staff_id')
      .eq('business_id', biz.id)
      .neq('status', 'cancelled')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at')
      .limit(100),
    supabase.from('business_staff').select('id, name, hours, sort_order').eq('business_id', biz.id).eq('active', true).order('sort_order'),
  ])

  const now = new Date()
  const lookout = new Date(now.getTime() + 14 * 24 * 60 * 60_000)

  const externalBusy = await getFreeBusy(biz.id, now, lookout)

  const fetchOverridesByStaff = async (staffIds: string[]) => {
    const { data: overrides } = await supabase
      .from('business_staff_availability')
      .select('staff_id, date, is_available, opens_at, closes_at')
      .in('staff_id', staffIds)
      .gte('date', dateStrInZone(now, biz.timezone))
      .lte('date', dateStrInZone(lookout, biz.timezone))

    const byStaff = new Map<string, Map<string, { isAvailable: boolean; opensAt: string | null; closesAt: string | null }>>()
    for (const o of overrides ?? []) {
      if (!byStaff.has(o.staff_id)) byStaff.set(o.staff_id, new Map())
      byStaff.get(o.staff_id)!.set(o.date, {
        isAvailable: o.is_available,
        opensAt: o.opens_at ? (o.opens_at as string).slice(0, 5) : null,
        closesAt: o.closes_at ? (o.closes_at as string).slice(0, 5) : null,
      })
    }
    return byStaff
  }

  const baseOpts = {
    hours: biz.hours as Hours,
    services: services ?? [],
    existing: existing ?? [],
    requestedService,
    externalBusy,
    timeZone: biz.timezone,
    preferredDate,
  }

  if (resolvedStaff) {
    const overridesByStaff = await fetchOverridesByStaff([resolvedStaff.id])
    const slots = findNextAvailableSlots({
      ...baseOpts,
      staffId: resolvedStaff.id,
      staffHours: resolvedStaff.hours,
      staffAvailabilityByDate: overridesByStaff.get(resolvedStaff.id),
    })
    return { slots, resolvedStaffName: resolvedStaff.name }
  }

  // No staff preference given. A slot is only actually unavailable to the
  // caller if EVERY active team member is busy then — not if any single one
  // of them happens to be. Union each staff member's own availability
  // (each already respects their own hours/day-off overrides) rather than
  // treating one person's appointment as blocking the whole team, otherwise
  // e.g. a slot Sarah is booked for reads as fully unavailable even when
  // Amanda is completely free at that exact time.
  if (activeRoster && activeRoster.length > 0) {
    const overridesByStaff = await fetchOverridesByStaff(activeRoster.map(s => s.id))
    const merged = new Map<number, Date>()
    for (const member of activeRoster) {
      const memberSlots = findNextAvailableSlots({
        ...baseOpts,
        staffId: member.id,
        staffHours: member.hours,
        staffAvailabilityByDate: overridesByStaff.get(member.id),
      })
      for (const s of memberSlots) merged.set(s.getTime(), s)
    }
    const slots = [...merged.values()].sort((a, b) => a.getTime() - b.getTime()).slice(0, DEFAULT_SLOT_COUNT)
    return { slots, resolvedStaffName: null }
  }

  // No staff roster configured at all — single shared resource, same as before staff support existed.
  const slots = findNextAvailableSlots({ ...baseOpts, staffId: undefined })
  return { slots, resolvedStaffName: null }
}

function fmtSlots(slots: Date[], timeZone: string): string {
  return slots.map(s => `${formatSlot(s, timeZone)} (${s.toISOString()})`).join('; ')
}

// end-of-call-report field extraction — Vapi has flattened some of these fields
// directly onto `message` in different API versions, so check both the nested
// (call/artifact/analysis) and flat shapes rather than trusting one.
type EndOfCallReport = Record<string, unknown> & {
  call?: {
    id?: string; assistantId?: string; type?: string; startedAt?: string; endedAt?: string
    customer?: { number?: string; name?: string } | string
    phoneNumber?: { number?: string } | string
  }
  artifact?: { transcript?: string; recordingUrl?: string }
  analysis?: { summary?: string; successEvaluation?: string; structuredData?: { callerName?: string | null } }
}

function eocCustomer(message: EndOfCallReport): { number?: string; name?: string } {
  const c = message.call?.customer ?? message.customer
  return typeof c === 'object' && c ? c as { number?: string; name?: string } : {}
}

function eocAssistantPhone(message: EndOfCallReport): string | undefined {
  const p = message.call?.phoneNumber ?? message.phoneNumber
  if (typeof p === 'string') return p || undefined
  return (p as { number?: string } | undefined)?.number || undefined
}

function eocDurationSeconds(message: EndOfCallReport, startedAt?: string, endedAt?: string): number | undefined {
  const raw = (message.durationSeconds ?? message.duration) as number | undefined
  if (raw != null && raw > 0) return raw > 7200 ? Math.round(raw / 1000) : Math.round(raw)
  if (startedAt && endedAt) {
    const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
    return ms > 0 ? Math.round(ms / 1000) : undefined
  }
  return undefined
}

// Real calls hit this server-to-server from Vapi's backend (no CORS involved),
// but Vapi's dashboard "Test" tool calls it directly from the browser — so a
// preflight OPTIONS request needs a response, and the actual response needs
// Access-Control-Allow-Origin, or the browser blocks it before it's read.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, { ...init, headers: { ...CORS_HEADERS, ...init?.headers } })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: Request) {
  const secret = process.env.VAPI_WEBHOOK_SECRET
  if (secret) {
    // Vapi sends this back as a plain `X-Vapi-Secret` header (raw value, no
    // "Bearer" prefix) when the assistant/tool's server config is wired to a
    // Bearer-Token Custom Credential configured that way — NOT as an
    // `Authorization: Bearer` header. Getting this wrong doesn't fail loud:
    // it just silently 401s every real call. See VAPI_WEBHOOK_SETUP.md.
    const provided = req.headers.get('x-vapi-secret')
    if (provided !== secret) {
      return json({ error: 'Unauthorized' }, { status: 401 })
    }
  } else {
    console.warn('VAPI_WEBHOOK_SECRET is not set — webhook is accepting unauthenticated requests.')
  }

  const body = await req.json()
  const { message } = body
  if (!message) return json({ ok: true })

  // Native transferCall tool with no configured `destinations` — Vapi asks
  // us where to send the call at transfer time instead of us hand-rolling a
  // custom tool. Response shape is `{ destination }` or `{ error }`, not the
  // `{ results: [...] }` shape every other tool-calls response uses.
  if (message.type === 'transfer-destination-request') {
    const assistantId = message.call?.assistantId as string | undefined

    try {
      const { data: biz } = await supabase
        .from('businesses')
        .select('transfer_phone_number')
        .eq('vapi_assistant_id', assistantId)
        .single()

      if (!biz?.transfer_phone_number) {
        return json({ error: 'No transfer number configured for this business — take a message instead.' })
      }

      return json({
        destination: {
          type: 'number',
          number: toE164Au(biz.transfer_phone_number),
          transferPlan: { mode: 'warm-transfer-say-summary' },
        },
      })
    } catch (err) {
      captureError(err, { handler: 'transfer-destination-request', assistantId })
      return json({ error: 'Something went wrong looking up the transfer number.' })
    }
  }

  if (message.type === 'tool-calls') {
    const results: { toolCallId: string; result: string }[] = []

    for (const toolCall of (message.toolCallList ?? []) as ToolCall[]) {
      const name = toolName(toolCall)

      if (name === 'checkAvailability') {
        const args = toolArgs(toolCall)
        let resultText: string

        try {
          const { data: biz } = await supabase
            .from('businesses')
            .select('id, hours, timezone')
            .eq('vapi_assistant_id', message.call?.assistantId)
            .single()

          if (!biz) {
            resultText = "I couldn't reach the calendar right now — let the caller know you'll confirm a time and call them back."
          } else {
            const preferredDate = args.preferredDate as string | undefined
            const { slots, resolvedStaffName } = await computeAvailableSlots(
              biz, args.service as string | undefined, args.staffMember as string | undefined, undefined, preferredDate,
            )
            const forWhom = resolvedStaffName ? ` for ${resolvedStaffName}` : ''
            const firstSlotDate = slots[0] ? dateStrInZone(slots[0], biz.timezone) : null
            const missedPreferredDay = !!preferredDate && !!firstSlotDate && firstSlotDate !== preferredDate

            // Grounds the model against the real clock every time — it has
            // to resolve relative days ("Thursday", "tomorrow") itself with
            // nothing else anchoring "today" in its own context, so a wrong
            // guess here is otherwise never caught (see PROJECT_CONTEXT.md).
            // Repeating this on every call lets it self-correct mid-booking
            // rather than only ever getting it from a stale system prompt.
            const todayLabel = formatInZone(new Date(), biz.timezone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
            const dateAnchor = `Today is ${todayLabel} in ${biz.timezone}. `

            resultText = dateAnchor + (slots.length
              ? `${missedPreferredDay ? "Nothing was open on the caller's preferred date, so these are the closest available instead — say so naturally, don't just offer them as if they matched what was asked. " : ''}Next available slots${forWhom}: ${fmtSlots(slots, biz.timezone)}. Offer these to the caller in natural speech — don't read out the ISO timestamps — and when you call bookAppointment, pass the exact ISO value for whichever slot they choose${resolvedStaffName ? `, along with staffMember: "${resolvedStaffName}"` : ''}.`
              : `No open slots found${forWhom}${preferredDate ? ' on or after the caller\'s preferred date' : ' in the next two weeks'} — let the caller know you'll have someone reach out to schedule.`)
          }
        } catch (err) {
          captureError(err, { handler: 'checkAvailability' })
          resultText = "Something went wrong checking the calendar — let the caller know you'll confirm a time shortly."
        }

        results.push({ toolCallId: toolCall.id, result: resultText })
        continue
      }

      if (name === 'findUpcomingAppointments') {
        const args  = toolArgs(toolCall)
        const phone = (args.customerPhone as string | undefined) ?? message.call?.customer?.number
        let resultText: string

        try {
          const { data: biz } = await supabase
            .from('businesses')
            .select('id, timezone')
            .eq('vapi_assistant_id', message.call?.assistantId)
            .single()

          if (!biz) {
            resultText = "I couldn't reach this business's account — let the caller know you'll have someone call them back."
          } else if (!phone) {
            resultText = "There's no phone number to search under — ask the caller to confirm the number their appointment is booked under."
          } else {
            const { data: candidates } = await supabase
              .from('appointments')
              .select('id, service, scheduled_at, customer_phone')
              .eq('business_id', biz.id)
              .neq('status', 'cancelled')
              .gte('scheduled_at', new Date().toISOString())
              .order('scheduled_at')
              .limit(50)

            const key = phoneDigitsKey(phone)
            const matches = (candidates ?? []).filter(a => a.customer_phone && phoneDigitsKey(a.customer_phone) === key)

            resultText = matches.length
              ? `Upcoming appointments found: ${matches.map(a => `${a.service ?? 'appointment'} on ${fmtDate(a.scheduled_at, biz.timezone)} (ref: ${a.id})`).join('; ')}. Read these out to the caller in natural speech without mentioning the refs, ask which one they mean, then call rescheduleAppointment (if they want a new time) or cancelAppointment (if they want it cancelled entirely) with that exact ref as appointmentId.`
              : "No upcoming appointments found for that number — let the caller know you couldn't find a booking to change or cancel, and offer to book a new one instead."
          }
        } catch (err) {
          captureError(err, { handler: 'findUpcomingAppointments' })
          resultText = "Something went wrong looking up the calendar — let the caller know you'll confirm shortly."
        }

        results.push({ toolCallId: toolCall.id, result: resultText })
        continue
      }

      if (name === 'rescheduleAppointment') {
        const args          = toolArgs(toolCall)
        const appointmentId = args.appointmentId as string | undefined
        const callId        = message.call?.id as string | undefined
        let resultText: string

        try {
          const { data: biz } = await supabase
            .from('businesses')
            .select('id, name, hours, twilio_phone_number, timezone, address, city, state, postcode, google_maps_url')
            .eq('vapi_assistant_id', message.call?.assistantId)
            .single()

          if (!biz) {
            resultText = "I couldn't find this business's account — let the caller know you'll confirm the change manually."
          } else if (!appointmentId) {
            resultText = "There's no valid appointment reference — call findUpcomingAppointments again and confirm which booking the caller means."
          } else {
            const { data: existing } = await supabase
              .from('appointments')
              .select('id, service, customer_name, customer_phone, calendar_event_id, staff_id')
              .eq('id', appointmentId)
              .eq('business_id', biz.id)
              .single()

            if (!existing) {
              resultText = "I couldn't find that appointment — let the caller know you'll confirm the change manually."
            } else {
              const { data: services } = await supabase
                .from('business_services')
                .select('name, duration_minutes')
                .eq('business_id', biz.id)
              const durationMins = durationFor(existing.service, services ?? [])

              // Deliberately does not set staff_id here — a reschedule keeps
              // whichever staff member the appointment was already booked
              // against; preserved simply by never touching the column.
              const { error: updateError } = await supabase.from('appointments').update({
                scheduled_at: args.newDateTime,
                status:       'rescheduled',
                vapi_call_id: callId ?? null,
              }).eq('id', existing.id)

              if (updateError?.code === '23505') {
                resultText = "That new time was just taken by someone else — apologise briefly, then call checkAvailability again to offer the caller a different time."
                try {
                  const { slots } = await computeAvailableSlots(biz, existing.service ?? undefined, undefined, existing.staff_id)
                  if (slots.length) {
                    resultText = `That new time was just taken by another caller. Apologise briefly, then offer these instead: ${fmtSlots(slots, biz.timezone)}. Don't read out the ISO timestamps, and pass the exact ISO value to rescheduleAppointment for whichever they choose.`
                  }
                } catch (altErr) {
                  console.error('Failed to compute alternative slots after a reschedule conflict:', altErr)
                }
              } else if (updateError) {
                console.error('Failed to reschedule appointment:', updateError)
                resultText = "Something went wrong moving that booking — let the caller know you'll confirm it manually."
              } else {
                resultText = `Rescheduled${existing.service ? ` ${existing.service}` : ''} for ${existing.customer_name ?? 'the caller'} to ${fmtDate(args.newDateTime as string, biz.timezone)}.`

                const phone = existing.customer_phone
                if (phone) {
                  try {
                    const link = mapsLink(biz)
                    const smsBody = [
                      `Hi ${existing.customer_name ?? ''} 👋`,
                      '',
                      `Your ${existing.service ?? 'appointment'} with ${biz.name} has been moved to:`,
                      `📅 ${fmtDate(args.newDateTime as string, biz.timezone)}`,
                      `⏱️ ${durationMins} minutes`,
                      ...(link ? ['', `📍 ${link}`] : []),
                      '',
                      'See you then! ✅',
                    ].join('\n')

                    await sendSms(phone, smsBody, biz.twilio_phone_number)
                    await supabase.from('appointments').update({ sms_sent: true }).eq('id', existing.id)
                  } catch (smsError) {
                    console.error('Failed to send reschedule confirmation SMS:', smsError)
                    // Reschedule already succeeded — don't fail the tool call over a text delivery issue.
                  }
                }

                if (existing.calendar_event_id) {
                  try {
                    const google = await getValidAccessToken(supabase, biz.id)
                    if (google) {
                      const start = new Date(args.newDateTime as string)
                      const end = new Date(start.getTime() + durationMins * 60_000)
                      await updateCalendarEvent(google.accessToken, google.calendarId, existing.calendar_event_id, { start, end })
                      invalidateFreeBusyCache(biz.id)
                    }
                  } catch (calErr) {
                    console.error('Failed to update Google Calendar event — reschedule already saved locally:', calErr)
                  }
                }
              }
            }
          }
        } catch (err) {
          captureError(err, { handler: 'rescheduleAppointment' })
          resultText = "Something went wrong on our end — let the caller know you'll confirm the change shortly."
        }

        results.push({ toolCallId: toolCall.id, result: resultText })
        continue
      }

      if (name === 'cancelAppointment') {
        const args          = toolArgs(toolCall)
        const appointmentId = args.appointmentId as string | undefined
        const callId        = message.call?.id as string | undefined
        let resultText: string

        try {
          const { data: biz } = await supabase
            .from('businesses')
            .select('id, name, twilio_phone_number, timezone')
            .eq('vapi_assistant_id', message.call?.assistantId)
            .single()

          if (!biz) {
            resultText = "I couldn't find this business's account — let the caller know you'll confirm the cancellation manually."
          } else if (!appointmentId) {
            resultText = "There's no valid appointment reference — call findUpcomingAppointments again and confirm which booking the caller means."
          } else {
            const { data: existing } = await supabase
              .from('appointments')
              .select('id, service, customer_name, customer_phone, scheduled_at, calendar_event_id')
              .eq('id', appointmentId)
              .eq('business_id', biz.id)
              .single()

            if (!existing) {
              resultText = "I couldn't find that appointment — let the caller know you'll confirm the cancellation manually."
            } else {
              const { error: updateError } = await supabase.from('appointments').update({
                status: 'cancelled',
                vapi_call_id: callId ?? null,
              }).eq('id', existing.id)

              if (updateError) {
                console.error('Failed to cancel appointment:', updateError)
                resultText = "Something went wrong cancelling that booking — let the caller know you'll confirm it manually."
              } else {
                resultText = `Cancelled${existing.service ? ` the ${existing.service}` : ''} appointment for ${existing.customer_name ?? 'the caller'}.`

                const phone = existing.customer_phone
                if (phone) {
                  try {
                    const smsBody = [
                      `Hi ${existing.customer_name ?? ''} 👋`,
                      '',
                      `Your ${existing.service ?? 'appointment'} with ${biz.name} on ${fmtDate(existing.scheduled_at, biz.timezone)} has been cancelled.`,
                      '',
                      "Let us know if you'd like to rebook.",
                    ].join('\n')

                    await sendSms(phone, smsBody, biz.twilio_phone_number)
                  } catch (smsError) {
                    console.error('Failed to send cancellation SMS:', smsError)
                    // Cancellation already succeeded — don't fail the tool call over a text delivery issue.
                  }
                }

                if (existing.calendar_event_id) {
                  try {
                    const google = await getValidAccessToken(supabase, biz.id)
                    if (google) {
                      await deleteCalendarEvent(google.accessToken, google.calendarId, existing.calendar_event_id)
                      invalidateFreeBusyCache(biz.id)
                    }
                  } catch (calErr) {
                    console.error('Failed to delete Google Calendar event — cancellation already saved locally:', calErr)
                  }
                }
              }
            }
          }
        } catch (err) {
          captureError(err, { handler: 'cancelAppointment' })
          resultText = "Something went wrong on our end — let the caller know you'll confirm the cancellation shortly."
        }

        results.push({ toolCallId: toolCall.id, result: resultText })
        continue
      }

      // Deliberately does not look anything up in `businesses` — for
      // assistants not linked to a business row yet (demos, one-off trials
      // set up straight in the Vapi dashboard). The assistant is expected to
      // compose `message` itself from whatever's in its own system prompt
      // (company name, links, etc.); this tool just sends exactly that text.
      // Sends from whichever number the caller actually dialled rather than
      // a business's configured Twilio number, since there may not be one.
      if (name === 'sendSms') {
        const args  = toolArgs(toolCall)
        const phone = (args.customerPhone as string | undefined) ?? message.call?.customer?.number
        const body  = args.message as string | undefined
        let resultText: string

        try {
          // Vapi's tool-calls payload only includes phoneNumberId, not the
          // number itself (confirmed against a real call — call.phoneNumber
          // is never populated here, unlike some other message types) — so
          // it has to be resolved via a lookup, not read straight off the payload.
          let from = message.call?.phoneNumber?.number as string | undefined
          const phoneNumberId = message.call?.phoneNumberId as string | undefined
          if (!from && phoneNumberId) {
            try {
              from = (await getPhoneNumber(phoneNumberId)).number
            } catch (lookupErr) {
              console.error('Failed to resolve phoneNumberId to a number:', lookupErr)
            }
          }

          if (!phone) {
            resultText = "There's no phone number to text — ask the caller to confirm the number they'd like the text sent to."
          } else if (!body) {
            resultText = "No message content was given — compose the text yourself using details from your own instructions, then call this tool again with that message."
          } else if (!from) {
            resultText = "Couldn't determine which number to text from — let the caller know you'll follow up another way."
          } else {
            await sendSms(phone, body, from)
            resultText = "Text message sent."
          }
        } catch (err) {
          captureError(err, { handler: 'sendSms(tool)' })
          resultText = "Something went wrong sending that text — let the caller know you'll follow up another way."
        }

        results.push({ toolCallId: toolCall.id, result: resultText })
        continue
      }

      // Also does not look anything up in `businesses` — validates against
      // the real Australian address database (GNAF, via Addressr) rather
      // than trusting whatever the caller said, and flags genuinely
      // ambiguous street names (e.g. "Jetty Road" exists in both Glenelg
      // and Brighton) instead of silently guessing one.
      if (name === 'validateAddress') {
        const args  = toolArgs(toolCall)
        const query = args.address as string | undefined
        let resultText: string

        try {
          if (!query) {
            resultText = "No address was given — ask the caller for their address."
          } else {
            const result = await lookupAddress(query)
            if (result.status === 'not_found') {
              resultText = `Couldn't find any address matching "${query}" — ask the caller to repeat it, including the suburb if they didn't give one.`
            } else if (result.status === 'ambiguous') {
              const options = result.candidates.map(c => `${c.suburb} ${c.postcode}`).join(', or ')
              resultText = `That street name matches more than one suburb: ${options}. Ask the caller which one they meant, then call this tool again with the full address including that suburb.`
            } else {
              resultText = `Address confirmed: ${result.address}. ${result.isMetro
                ? 'This is within the Adelaide metro service area.'
                : "This is OUTSIDE the usual Adelaide metro service area — let the caller know gently, but still continue with the booking."
              } Read this exact address back to the caller to confirm it's right.`
            }
          }
        } catch (err) {
          captureError(err, { handler: 'validateAddress' })
          resultText = "Something went wrong looking up that address — just confirm it verbally with the caller instead."
        }

        results.push({ toolCallId: toolCall.id, result: resultText })
        continue
      }

      if (name !== 'bookAppointment') continue

      const args   = toolArgs(toolCall)
      const phone  = (args.customerPhone as string | undefined) ?? message.call?.customer?.number
      const callId = message.call?.id as string | undefined
      let resultText: string

      try {
        const { data: biz } = await supabase
          .from('businesses')
          .select('id, name, hours, twilio_phone_number, timezone, address, city, state, postcode, google_maps_url')
          .eq('vapi_assistant_id', message.call?.assistantId)
          .single()

        if (!biz) {
          resultText = "I couldn't find this business's account — let the caller know you'll have someone call them back to confirm."
        } else {
          const [{ data: services }, resolvedStaff, { data: activeRoster }] = await Promise.all([
            supabase.from('business_services').select('name, duration_minutes').eq('business_id', biz.id),
            resolveStaffMember(biz.id, args.staffMember as string | undefined),
            supabase.from('business_staff').select('id, name, hours, sort_order').eq('business_id', biz.id).eq('active', true).order('sort_order'),
          ])
          const durationMins = durationFor(args.service as string | undefined, services ?? [])
          const requestedStart = new Date(args.dateTime as string)
          const requestedEnd = new Date(requestedStart.getTime() + durationMins * 60_000)
          const dateKey = dateStrInZone(requestedStart, biz.timezone)

          let overrideByStaff = new Map<string, { isAvailable: boolean; opensAt: string | null; closesAt: string | null }>()
          if (activeRoster && activeRoster.length > 0) {
            const { data: overridesForDate } = await supabase
              .from('business_staff_availability')
              .select('staff_id, is_available, opens_at, closes_at')
              .in('staff_id', activeRoster.map(s => s.id))
              .eq('date', dateKey)
            overrideByStaff = new Map((overridesForDate ?? []).map(o => [o.staff_id, {
              isAvailable: o.is_available,
              opensAt: o.opens_at ? (o.opens_at as string).slice(0, 5) : null,
              closesAt: o.closes_at ? (o.closes_at as string).slice(0, 5) : null,
            }]))
          }
          const overrideMapFor = (staffId: string) =>
            overrideByStaff.has(staffId) ? new Map([[dateKey, overrideByStaff.get(staffId)!]]) : undefined

          let finalStaff = resolvedStaff

          if (!finalStaff && activeRoster && activeRoster.length > 0) {
            // No staff preference given — assign whichever active team member
            // is actually free at this exact time (first by sort_order). This
            // has to match what checkAvailability's "anyone" union already
            // promised the caller — leaving staff_id null here would let two
            // different unassigned bookings for the same slot collide on the
            // unique index even when different staff members are free to take them.
            const { data: existingForConflict } = await supabase
              .from('appointments').select('scheduled_at, service, staff_id').eq('business_id', biz.id).neq('status', 'cancelled')

            for (const candidate of activeRoster) {
              const candidateWithinHours = isWithinOpenHours({
                date: requestedStart, durationMinutes: durationMins, hours: biz.hours as Hours, timeZone: biz.timezone,
                staffHours: candidate.hours, staffAvailabilityByDate: overrideMapFor(candidate.id),
              })
              if (!candidateWithinHours) continue
              if (hasConflictingAppointment(existingForConflict ?? [], candidate.id, services ?? [], requestedStart, requestedEnd)) continue
              finalStaff = { id: candidate.id, name: candidate.name, hours: candidate.hours }
              break
            }
          }

          // `dateTime` is trusted verbatim from the model — nothing upstream
          // guarantees it actually came from a real checkAvailability result
          // (the model can misresolve a relative day like "Thursday" and
          // still pass a well-formed but wrong ISO string). Re-check it
          // against real hours before writing it, rather than only catching
          // an exact double-booked slot via the DB's unique index below.
          const withinHours = isWithinOpenHours({
            date: requestedStart,
            durationMinutes: durationMins,
            hours: biz.hours as Hours,
            timeZone: biz.timezone,
            staffHours: finalStaff?.hours,
            staffAvailabilityByDate: finalStaff ? overrideMapFor(finalStaff.id) : undefined,
          })

          if (!withinHours) {
            let recoveryText = "That time isn't actually available — apologise briefly, then call checkAvailability again to offer the caller a real time."
            try {
              const { slots, resolvedStaffName } = await computeAvailableSlots(biz, args.service as string | undefined, undefined, finalStaff?.id ?? resolvedStaff?.id)
              if (slots.length) {
                recoveryText = `That time isn't actually available${resolvedStaffName ? ` for ${resolvedStaffName}` : ''}. Apologise briefly, then offer these instead: ${fmtSlots(slots, biz.timezone)}. Don't read out the ISO timestamps, and pass the exact ISO value to bookAppointment for whichever they choose.`
              }
            } catch (altErr) {
              console.error('Failed to compute alternative slots after an out-of-hours booking attempt:', altErr)
            }
            results.push({ toolCallId: toolCall.id, result: recoveryText })
            continue
          }

          const appointmentRow = {
            business_id:    biz.id,
            customer_name:  args.customerName  ?? 'Unknown',
            customer_phone: phone ?? null,
            customer_email: args.customerEmail ?? null,
            service:        args.service       ?? null,
            scheduled_at:   args.dateTime,
            status:         'confirmed',
            notes:          args.notes ?? null,
            vapi_call_id:   callId ?? null,
            staff_id:       finalStaff?.id ?? null,
          }

          let { data: inserted, error: insertError } = await supabase.from('appointments').insert(appointmentRow).select('id').single()

          // `vapi_call_id` is a recently-added column — if the migration hasn't been
          // run in this environment yet, don't let that break the actual booking.
          if (insertError?.code === '42703') {
            console.error('appointments.vapi_call_id column missing — run supabase-schema-appointments-call-link.sql. Retrying without it.')
            const withoutCallId = { ...appointmentRow, vapi_call_id: undefined }
            ;({ data: inserted, error: insertError } = await supabase.from('appointments').insert(withoutCallId).select('id').single())
          }

          // Another caller booked this exact slot in the moment between this
          // caller being offered it and bookAppointment actually running —
          // see the unique index on appointments(business_id, scheduled_at).
          // Recover with fresh alternatives rather than a dead-end error.
          if (insertError?.code === '23505') {
            resultText = "That time was just booked by someone else — apologise briefly, then call checkAvailability again to offer the caller a different time."
            try {
              const { slots, resolvedStaffName } = await computeAvailableSlots(biz, args.service as string | undefined, undefined, finalStaff?.id)
              if (slots.length) {
                resultText = `That time was just taken by another caller. Apologise briefly, then offer these instead${resolvedStaffName ? ` for ${resolvedStaffName}` : ''}: ${fmtSlots(slots, biz.timezone)}. Don't read out the ISO timestamps, and pass the exact ISO value to bookAppointment for whichever they choose.`
              }
            } catch (altErr) {
              console.error('Failed to compute alternative slots after a booking conflict:', altErr)
            }
          } else if (insertError) {
            console.error('Failed to insert appointment:', insertError)
            resultText = "Something went wrong saving that booking — let the caller know you'll confirm it manually."
          } else {
            resultText = `Booked${args.service ? ` ${args.service}` : ''} for ${args.customerName ?? 'the caller'}${finalStaff ? ` with ${finalStaff.name}` : ''} on ${fmtDate(args.dateTime as string, biz.timezone)}.`

            if (phone) {
              await rememberCustomerName(supabase, biz.id, phone, args.customerName as string | undefined)

              try {
                const link = mapsLink(biz)
                const smsBody = [
                  `Hi ${args.customerName ?? ''} 👋`,
                  '',
                  `Your ${args.service ?? 'appointment'} with ${biz.name} is confirmed for:`,
                  `📅 ${fmtDate(args.dateTime as string, biz.timezone)}`,
                  `⏱️ ${durationMins} minutes`,
                  ...(link ? ['', `📍 ${link}`] : []),
                  '',
                  'See you then! ✅',
                ].join('\n')

                await sendSms(phone, smsBody, biz.twilio_phone_number)
                await supabase.from('appointments').update({ sms_sent: true }).eq('id', inserted!.id)
              } catch (smsError) {
                console.error('Failed to send confirmation SMS:', smsError)
                // Booking already succeeded — don't fail the tool call over a text delivery issue.
              }
            }

            try {
              const google = await getValidAccessToken(supabase, biz.id)
              if (google) {
                const start = new Date(args.dateTime as string)
                const end = new Date(start.getTime() + durationMins * 60_000)

                const event = await createCalendarEvent(google.accessToken, google.calendarId, {
                  summary: `${args.service ?? 'Appointment'} — ${args.customerName ?? 'Customer'}${finalStaff ? ` (with ${finalStaff.name})` : ''}`,
                  description: [phone && `Phone: ${phone}`, args.customerEmail && `Email: ${args.customerEmail}`]
                    .filter(Boolean).join('\n'),
                  start,
                  end,
                })

                await supabase.from('appointments')
                  .update({ calendar_event_id: event.id, calendar_event_link: event.htmlLink ?? null })
                  .eq('id', inserted!.id)
                invalidateFreeBusyCache(biz.id)
              }
            } catch (calErr) {
              console.error('Failed to create Google Calendar event — booking already saved locally:', calErr)
            }
          }
        }
      } catch (err) {
        captureError(err, { handler: 'bookAppointment' })
        resultText = "Something went wrong on our end — let the caller know you'll confirm the booking shortly."
      }

      results.push({ toolCallId: toolCall.id, result: resultText })
    }

    return json({ results })
  }

  if (message.type === 'end-of-call-report') {
    const report = message as EndOfCallReport
    const assistantId = report.call?.assistantId as string | undefined
    const callId       = report.call?.id as string | undefined

    try {
      if (!assistantId || !callId) {
        console.error('end-of-call-report missing assistantId or call id', report)
        return json({ ok: true })
      }

      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('vapi_assistant_id', assistantId)
        .single()

      if (!biz) {
        console.error('end-of-call-report: no business found for assistant', assistantId)
        return json({ ok: true })
      }

      const startedAt = (report.call?.startedAt ?? report.startedAt) as string | undefined
      const endedAt   = (report.call?.endedAt   ?? report.endedAt)   as string | undefined
      const customer  = eocCustomer(report)
      const endedReason = report.endedReason as string | undefined

      const { data: correlated } = await supabase
        .from('appointments')
        .select('id, status, customer_name')
        .eq('vapi_call_id', callId)
        .limit(1)
      const hasBooking    = !!correlated?.length
      const hasReschedule = correlated?.[0]?.status === 'rescheduled'

      // Priority: Vapi's own customer metadata (rare for phone calls) > the
      // name confirmed out loud during a booking/reschedule/cancellation on
      // this call (most reliable) > a name remembered from a past call on
      // this same number > an LLM guess from the raw transcript (least
      // certain, only tried once everything more reliable has come up empty).
      let callerName = customer.name ?? correlated?.[0]?.customer_name ?? null
      if (!callerName && customer.number) {
        const { data: known } = await supabase
          .from('customers')
          .select('name')
          .eq('business_id', biz.id)
          .eq('phone', phoneDigitsKey(customer.number))
          .single()
        callerName = known?.name ?? null
      }
      callerName = callerName ?? report.analysis?.structuredData?.callerName ?? null

      const { error } = await supabase.from('calls').upsert({
        business_id:        biz.id,
        vapi_call_id:       callId,
        vapi_assistant_id:  assistantId,
        call_type:          report.call?.type ?? null,
        status:             'ended',
        caller_name:        callerName,
        caller_phone:       customer.number ?? null,
        assistant_phone:    eocAssistantPhone(report) ?? null,
        started_at:         startedAt ?? null,
        ended_at:           endedAt ?? null,
        duration_seconds:   eocDurationSeconds(report, startedAt, endedAt) ?? null,
        ended_reason:       endedReason ?? null,
        outcome:            classifyCall(endedReason, hasBooking, hasReschedule).category,
        summary:            (report.analysis?.summary ?? report.summary ?? null) as string | null,
        success_evaluation: (report.analysis?.successEvaluation ?? null) as string | null,
        transcript:         (report.artifact?.transcript ?? report.transcript ?? null) as string | null,
        recording_url:      (report.artifact?.recordingUrl ?? report.recordingUrl ?? null) as string | null,
        raw_payload:        report,
        updated_at:         new Date().toISOString(),
      }, { onConflict: 'vapi_call_id' })

      if (error) console.error('Failed to save call record:', error)
    } catch (err) {
      captureError(err, { handler: 'end-of-call-report', callId })
    }

    return json({ ok: true })
  }

  return json({ ok: true })
}
