import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const body = await req.json()

  // Vapi sends different event types
  const { message } = body
  if (!message) return NextResponse.json({ ok: true })

  if (message.type === 'tool-calls') {
    // AI is calling a booking tool — save the appointment
    for (const toolCall of message.toolCallList ?? []) {
      if (toolCall.function?.name === 'bookAppointment') {
        const args  = toolCall.function.arguments ?? {}
        const phone = message.call?.customer?.number

        // Find the business by Vapi assistant ID
        const { data: biz } = await supabase
          .from('businesses')
          .select('id')
          .eq('vapi_assistant_id', message.call?.assistantId)
          .single()

        if (biz) {
          await supabase.from('appointments').insert({
            business_id:    biz.id,
            customer_name:  args.customerName  ?? 'Unknown',
            customer_phone: args.customerPhone ?? phone ?? null,
            customer_email: args.customerEmail ?? null,
            service:        args.service       ?? null,
            scheduled_at:   args.dateTime,
            status:         'confirmed',
          })
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
