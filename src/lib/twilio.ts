/**
 * Raw fetch against Twilio's REST API — no SDK, matching the pattern in lib/vapi.ts.
 * `from` must be the sending business's own Twilio number, read live from
 * `businesses.twilio_phone_number` by the caller — multi-tenant, every client
 * has their own number, so there's no shared/hardcoded fallback here. A
 * business with no number configured is a real setup problem, not something
 * to paper over by silently texting from an unrelated business's number, so
 * this throws instead.
 */
export async function sendSms(to: string, body: string, from: string | null | undefined): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) {
    throw new Error('Twilio is not configured — set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN')
  }
  if (!from) {
    throw new Error('No Twilio number configured for this business — set one on the Business page before SMS can be sent.')
  }

  const auth = Buffer.from(`${sid}:${token}`).toString('base64')
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Twilio send failed: ${res.status} ${detail}`)
  }
}

/** Vapi's own inbound handler for Twilio-imported numbers — restoring a number's VoiceUrl to this is what makes Ellie answer it again. */
export const VAPI_INBOUND_VOICE_URL = 'https://api.vapi.ai/twilio/inbound_call'

function twilioAuthHeader(): { sid: string; header: string } {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) throw new Error('Twilio is not configured — set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN')
  return { sid, header: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` }
}

/**
 * Points a Twilio number's inbound-call webhook at `voiceUrl` — used to pause
 * Ellie by redirecting the number to a plain call-forwarding TwiML endpoint
 * instead of Vapi, and to resume by pointing it back at Vapi's own handler
 * (`VAPI_INBOUND_VOICE_URL`). Bypasses Vapi's phone-number config entirely,
 * so it isn't affected by whatever makes Vapi's own `fallbackDestination`
 * unreliable for Twilio-imported numbers.
 */
export async function setTwilioVoiceUrl(phoneNumber: string, voiceUrl: string): Promise<void> {
  const { sid, header } = twilioAuthHeader()

  const lookupParams = new URLSearchParams({ PhoneNumber: phoneNumber })
  const lookupRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?${lookupParams}`, {
    headers: { Authorization: header },
  })
  if (!lookupRes.ok) throw new Error(`Twilio number lookup failed: ${lookupRes.status} ${await lookupRes.text()}`)
  const numberSid = (await lookupRes.json()).incoming_phone_numbers?.[0]?.sid as string | undefined
  if (!numberSid) throw new Error(`Could not find ${phoneNumber} in Twilio.`)

  const updateRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers/${numberSid}.json`, {
    method: 'POST',
    headers: { Authorization: header, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ VoiceUrl: voiceUrl, VoiceMethod: 'POST' }),
  })
  if (!updateRes.ok) throw new Error(`Twilio number update failed: ${updateRes.status} ${await updateRes.text()}`)
}
