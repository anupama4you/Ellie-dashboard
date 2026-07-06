import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendSms } from '@/lib/twilio'

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

export async function POST(req: Request) {
  const secret = process.env.VAPI_WEBHOOK_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } else {
    console.warn('VAPI_WEBHOOK_SECRET is not set — webhook is accepting unauthenticated requests.')
  }

  const body = await req.json()
  const { message } = body
  if (!message) return NextResponse.json({ ok: true })

  if (message.type === 'tool-calls') {
    const results: { toolCallId: string; result: string }[] = []

    for (const toolCall of (message.toolCallList ?? []) as ToolCall[]) {
      if (toolName(toolCall) !== 'bookAppointment') continue

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

    return NextResponse.json({ results })
  }

  return NextResponse.json({ ok: true })
}
