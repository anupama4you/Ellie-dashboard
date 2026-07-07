/**
 * Raw fetch against Twilio's REST API — no SDK, matching the pattern in lib/vapi.ts.
 * `from` should be the sending business's own Twilio number (multi-tenant — every
 * client has their own number, or their customers get texts from an unrelated
 * business's number). Falls back to the shared env var only if a business hasn't
 * got one configured yet.
 */
export async function sendSms(to: string, body: string, from?: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = from || process.env.TWILIO_PHONE_NUMBER
  if (!sid || !token || !fromNumber) {
    throw new Error('Twilio is not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either a business twilio_phone_number or TWILIO_PHONE_NUMBER')
  }

  const auth = Buffer.from(`${sid}:${token}`).toString('base64')
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Twilio send failed: ${res.status} ${detail}`)
  }
}
