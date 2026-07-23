import { NextResponse } from 'next/server'

/**
 * Set as a Twilio number's VoiceUrl while a business has paused Ellie
 * (`setLineActive` in `src/app/(dashboard)/actions.ts`) — a plain call
 * forward straight to the business's own transfer number, via Twilio's
 * native `<Dial>`, no Vapi involved. `to` is the E.164 number to forward to,
 * embedded in the URL at pause-time by us, never caller-supplied.
 */
function twiml(req: Request): NextResponse {
  const to = new URL(req.url).searchParams.get('to')

  const body = to
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Dial>${to}</Dial></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, we can't take your call right now. Please try again shortly.</Say><Hangup/></Response>`

  return new NextResponse(body, { headers: { 'Content-Type': 'text/xml' } })
}

export async function POST(req: Request) {
  return twiml(req)
}

export async function GET(req: Request) {
  return twiml(req)
}
