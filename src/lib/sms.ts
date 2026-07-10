/** Raw fetch against Twilio's REST API — no SDK, matching the pattern in lib/vapi.ts and lib/twilio.ts. */
async function twilioGet(accountSid: string, authToken: string, path: string, params: URLSearchParams) {
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}${path}?${params}`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Twilio ${path} → ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return res.json()
}

export type SmsLogEntry = {
  sid: string
  to: string
  body: string
  status: string
  dateSent: string | null
}

/**
 * Outbound SMS history for `fromNumber`, read live from Twilio's own message
 * log — same approach as call history being read live from Vapi's API
 * rather than duplicated locally, so delivery status is always current
 * without needing a status-callback webhook to keep a local copy in sync.
 */
export async function getSmsLog(fromNumber: string, limit = 100): Promise<SmsLogEntry[]> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) throw new Error('Twilio is not configured — set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN')

  const params = new URLSearchParams({ From: fromNumber, PageSize: String(limit) })
  const data = await twilioGet(sid, token, '/Messages.json', params)

  return ((data.messages ?? []) as Record<string, string | null>[]).map(m => ({
    sid: (m.sid ?? '') as string,
    to: (m.to ?? '') as string,
    body: (m.body ?? '') as string,
    status: (m.status ?? 'unknown') as string,
    dateSent: (m.date_sent ?? m.date_created) as string | null,
  }))
}

/** Last 9 digits, digits-only — enough to match an AU mobile/landline across `+61…`, `0…`, and spaced display formats without a full parsing library. */
export function phoneDigitsKey(phone: string): string {
  return phone.replace(/\D/g, '').slice(-9)
}

/** `+61432118774` / `0432118774` → `0432 118 774` — falls back to the raw input for anything that isn't a 9-digit AU number. */
export function formatAuPhone(phone: string): string {
  const digits = phoneDigitsKey(phone)
  if (digits.length !== 9) return phone
  return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
}
