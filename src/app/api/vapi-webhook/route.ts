import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendSms } from '@/lib/twilio'
import { findNextAvailableSlots, formatSlot } from '@/lib/availability'
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

function fmtDate(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
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
            .select('id, hours')
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

            const slots = findNextAvailableSlots({
              hours: biz.hours as Hours,
              services: services ?? [],
              existing: existing ?? [],
              requestedService: args.service as string | undefined,
            })

            resultText = slots.length
              ? `Next available slots: ${slots.map(s => `${formatSlot(s)} (${s.toISOString()})`).join('; ')}. Offer these to the caller in natural speech — don't read out the ISO timestamps — and when you call bookAppointment, pass the exact ISO value for whichever slot they choose.`
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
          .select('id, name')
          .eq('vapi_assistant_id', message.call?.assistantId)
          .single()

        if (!biz) {
          resultText = "I couldn't find this business's account — let the caller know you'll have someone call them back to confirm."
        } else {
          const { error: insertError } = await supabase.from('appointments').insert({
            business_id:    biz.id,
            customer_name:  args.customerName  ?? 'Unknown',
            customer_phone: phone ?? null,
            customer_email: args.customerEmail ?? null,
            service:        args.service       ?? null,
            scheduled_at:   args.dateTime,
            status:         'confirmed',
          })

          if (insertError) {
            console.error('Failed to insert appointment:', insertError)
            resultText = "Something went wrong saving that booking — let the caller know you'll confirm it manually."
          } else {
            resultText = `Booked${args.service ? ` ${args.service}` : ''} for ${args.customerName ?? 'the caller'} on ${fmtDate(args.dateTime as string)}.`

            if (phone) {
              try {
                await sendSms(
                  phone,
                  `Hi ${args.customerName ?? ''}, your ${args.service ?? 'appointment'} with ${biz.name} is confirmed for ${fmtDate(args.dateTime as string)}. Reply STOP to opt out.`
                )
              } catch (smsError) {
                console.error('Failed to send confirmation SMS:', smsError)
                // Booking already succeeded — don't fail the tool call over a text delivery issue.
              }
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

  return json({ ok: true })
}
