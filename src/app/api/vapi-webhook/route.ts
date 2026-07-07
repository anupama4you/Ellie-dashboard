import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendSms } from '@/lib/twilio'
import { findNextAvailableSlots, formatSlot, durationFor } from '@/lib/availability'
import { classifyCall } from '@/lib/callClassify'
import { getValidAccessToken, freeBusyQuery, createCalendarEvent } from '@/lib/googleCalendar'
import { formatInZone } from '@/lib/timezone'
import type { Hours } from '@/app/(dashboard)/briefing/actions'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
  analysis?: { summary?: string; successEvaluation?: string }
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
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return json({ error: 'Unauthorized' }, { status: 401 })
    }
  } else {
    console.warn('VAPI_WEBHOOK_SECRET is not set — webhook is accepting unauthenticated requests.')
  }

  const body = await req.json()
  const { message } = body
  if (!message) return json({ ok: true })

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
            const [{ data: services }, { data: existing }] = await Promise.all([
              supabase.from('business_services').select('name, duration_minutes').eq('business_id', biz.id),
              supabase.from('appointments')
                .select('scheduled_at, service')
                .eq('business_id', biz.id)
                .neq('status', 'cancelled')
                .gte('scheduled_at', new Date().toISOString())
                .order('scheduled_at')
                .limit(100),
            ])

            let externalBusy: { start: Date; end: Date }[] = []
            try {
              const google = await getValidAccessToken(supabase, biz.id)
              if (google) {
                const now = new Date()
                const lookout = new Date(now.getTime() + 14 * 24 * 60 * 60_000)
                const busy = await freeBusyQuery(google.accessToken, google.calendarId, now, lookout)
                externalBusy = busy.map(b => ({ start: new Date(b.start), end: new Date(b.end) }))
              }
            } catch (calErr) {
              console.error('Google Calendar free/busy check failed — falling back to local availability only:', calErr)
            }

            const slots = findNextAvailableSlots({
              hours: biz.hours as Hours,
              services: services ?? [],
              existing: existing ?? [],
              requestedService: args.service as string | undefined,
              externalBusy,
              timeZone: biz.timezone,
            })

            resultText = slots.length
              ? `Next available slots: ${slots.map(s => `${formatSlot(s, biz.timezone)} (${s.toISOString()})`).join('; ')}. Offer these to the caller in natural speech — don't read out the ISO timestamps — and when you call bookAppointment, pass the exact ISO value for whichever slot they choose.`
              : "No open slots found in the next two weeks — let the caller know you'll have someone reach out to schedule."
          }
        } catch (err) {
          console.error('checkAvailability tool call failed:', err)
          resultText = "Something went wrong checking the calendar — let the caller know you'll confirm a time shortly."
        }

        results.push({ toolCallId: toolCall.id, result: resultText })
        continue
      }

      if (name !== 'bookAppointment') continue

      const args  = toolArgs(toolCall)
      const phone = (args.customerPhone as string | undefined) ?? message.call?.customer?.number
      let resultText: string

      try {
        const { data: biz } = await supabase
          .from('businesses')
          .select('id, name, twilio_phone_number, timezone')
          .eq('vapi_assistant_id', message.call?.assistantId)
          .single()

        if (!biz) {
          resultText = "I couldn't find this business's account — let the caller know you'll have someone call them back to confirm."
        } else {
          const { data: inserted, error: insertError } = await supabase.from('appointments').insert({
            business_id:    biz.id,
            customer_name:  args.customerName  ?? 'Unknown',
            customer_phone: phone ?? null,
            customer_email: args.customerEmail ?? null,
            service:        args.service       ?? null,
            scheduled_at:   args.dateTime,
            status:         'confirmed',
          }).select('id').single()

          if (insertError) {
            console.error('Failed to insert appointment:', insertError)
            resultText = "Something went wrong saving that booking — let the caller know you'll confirm it manually."
          } else {
            resultText = `Booked${args.service ? ` ${args.service}` : ''} for ${args.customerName ?? 'the caller'} on ${fmtDate(args.dateTime as string, biz.timezone)}.`

            if (phone) {
              try {
                await sendSms(
                  phone,
                  `Hi ${args.customerName ?? ''}, your ${args.service ?? 'appointment'} with ${biz.name} is confirmed for ${fmtDate(args.dateTime as string, biz.timezone)}. Reply STOP to opt out.`,
                  biz.twilio_phone_number ?? undefined,
                )
              } catch (smsError) {
                console.error('Failed to send confirmation SMS:', smsError)
                // Booking already succeeded — don't fail the tool call over a text delivery issue.
              }
            }

            try {
              const google = await getValidAccessToken(supabase, biz.id)
              if (google) {
                const { data: services } = await supabase
                  .from('business_services')
                  .select('name, duration_minutes')
                  .eq('business_id', biz.id)
                const start = new Date(args.dateTime as string)
                const durationMins = durationFor(args.service as string | undefined, services ?? [])
                const end = new Date(start.getTime() + durationMins * 60_000)

                const event = await createCalendarEvent(google.accessToken, google.calendarId, {
                  summary: `${args.service ?? 'Appointment'} — ${args.customerName ?? 'Customer'}`,
                  description: [phone && `Phone: ${phone}`, args.customerEmail && `Email: ${args.customerEmail}`]
                    .filter(Boolean).join('\n'),
                  start,
                  end,
                })

                await supabase.from('appointments')
                  .update({ calendar_event_id: event.id, calendar_event_link: event.htmlLink ?? null })
                  .eq('id', inserted.id)
              }
            } catch (calErr) {
              console.error('Failed to create Google Calendar event — booking already saved locally:', calErr)
            }
          }
        }
      } catch (err) {
        console.error('bookAppointment tool call failed:', err)
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

      const { error } = await supabase.from('calls').upsert({
        business_id:        biz.id,
        vapi_call_id:       callId,
        vapi_assistant_id:  assistantId,
        call_type:          report.call?.type ?? null,
        status:             'ended',
        caller_name:        customer.name ?? null,
        caller_phone:       customer.number ?? null,
        assistant_phone:    eocAssistantPhone(report) ?? null,
        started_at:         startedAt ?? null,
        ended_at:           endedAt ?? null,
        duration_seconds:   eocDurationSeconds(report, startedAt, endedAt) ?? null,
        ended_reason:       endedReason ?? null,
        outcome:            classifyCall(endedReason).category,
        summary:            (report.analysis?.summary ?? report.summary ?? null) as string | null,
        success_evaluation: (report.analysis?.successEvaluation ?? null) as string | null,
        transcript:         (report.artifact?.transcript ?? report.transcript ?? null) as string | null,
        recording_url:      (report.artifact?.recordingUrl ?? report.recordingUrl ?? null) as string | null,
        raw_payload:        report,
        updated_at:         new Date().toISOString(),
      }, { onConflict: 'vapi_call_id' })

      if (error) console.error('Failed to save call record:', error)
    } catch (err) {
      console.error('end-of-call-report handling failed:', err)
    }

    return json({ ok: true })
  }

  return json({ ok: true })
}
