import { NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'
import { captureError } from '@/lib/monitoring'

/** Twilio's documented request-signing algorithm: HMAC-SHA1(authToken, url + sorted "key"+"value" pairs), base64-encoded. https://www.twilio.com/docs/usage/webhooks/webhooks-security */
function computeTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort()
  const data = sortedKeys.reduce((acc, key) => acc + key + params[key], url)
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64')
}

/**
 * Reconstructs the exact external URL Twilio requested, for signature
 * verification — `req.url` alone can report an internal scheme/host in some
 * serverless/proxy setups, so prefer the standard forwarded headers (present
 * on Vercel and most reverse proxies) when available.
 */
function externalUrl(req: Request): string {
  const url = new URL(req.url)
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host
  return `${proto}://${host}${url.pathname}${url.search}`
}

/**
 * Verifies the request actually came from Twilio. Currently observe-only —
 * logs a mismatch via captureError rather than rejecting the request — until
 * a period of clean logs confirms the URL reconstruction above matches what
 * Twilio actually signs in this deployment's environment. Flip the `if
 * (!valid)` branch below to return a 403 once confirmed. Fails open (skips
 * the check, doesn't block) if TWILIO_AUTH_TOKEN isn't set, matching this
 * codebase's existing pattern for optional webhook secrets elsewhere.
 */
async function verifyTwilioSignature(req: Request, params: Record<string, string>): Promise<void> {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const signature = req.headers.get('x-twilio-signature')
  if (!authToken || !signature) return

  try {
    const expected = computeTwilioSignature(authToken, externalUrl(req), params)
    if (expected !== signature) {
      captureError(new Error('Twilio signature mismatch on twilio-forward-call — observe-only, request still served'), {
        handler: 'twilio-forward-call/verifyTwilioSignature',
      })
    }
  } catch (err) {
    captureError(err, { handler: 'twilio-forward-call/verifyTwilioSignature' })
  }
}

/** XML-escapes a value before it's interpolated into hand-built TwiML — `to` is always a plain E.164 number in normal use, so this changes nothing for legitimate traffic, it only closes off TwiML injection via a crafted query param. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

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
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Dial>${escapeXml(to)}</Dial></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, we can't take your call right now. Please try again shortly.</Say><Hangup/></Response>`

  return new NextResponse(body, { headers: { 'Content-Type': 'text/xml' } })
}

export async function POST(req: Request) {
  const formData = await req.formData().catch(() => null)
  const params = formData ? Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)])) : {}
  await verifyTwilioSignature(req, params)
  return twiml(req)
}

export async function GET(req: Request) {
  await verifyTwilioSignature(req, {})
  return twiml(req)
}
