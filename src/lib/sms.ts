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

export type SmsMessage = {
  sid: string
  from: string
  to: string
  body: string
  status: string
  direction: 'inbound' | 'outbound'
  dateSent: string | null
}

export type SmsThread = {
  /** `phoneDigitsKey` of the other party — stable across formatting differences, used as the thread's id. */
  phone: string
  /** The other party's phone in whatever format Twilio reported it, for display and as the `to` when replying. */
  displayPhone: string
  /** Chronological, oldest first. */
  messages: SmsMessage[]
}

function toSmsMessage(m: Record<string, string | null>, direction: SmsMessage['direction']): SmsMessage {
  return {
    sid: (m.sid ?? '') as string,
    from: (m.from ?? '') as string,
    to: (m.to ?? '') as string,
    body: (m.body ?? '') as string,
    status: (m.status ?? 'unknown') as string,
    direction,
    dateSent: (m.date_sent ?? m.date_created) as string | null,
  }
}

/**
 * Full SMS history — both directions — for `businessNumber`, read live from
 * Twilio's own message log rather than duplicated locally, same approach as
 * call history being read live from Vapi's API: delivery status is always
 * current without needing a status-callback webhook to keep a local copy in
 * sync. Two separate queries (Twilio has no single "either side" filter),
 * deduped by `sid` since a message where both parties are this account's
 * own numbers would otherwise appear in both.
 */
export async function getSmsMessages(businessNumber: string, limit = 200): Promise<SmsMessage[]> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) throw new Error('Twilio is not configured — set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN')

  const [outbound, inbound] = await Promise.all([
    twilioGet(sid, token, '/Messages.json', new URLSearchParams({ From: businessNumber, PageSize: String(limit) })),
    twilioGet(sid, token, '/Messages.json', new URLSearchParams({ To: businessNumber, PageSize: String(limit) })),
  ])

  const seen = new Set<string>()
  const messages: SmsMessage[] = []
  for (const m of (outbound.messages ?? []) as Record<string, string | null>[]) {
    if (m.sid && !seen.has(m.sid)) { seen.add(m.sid); messages.push(toSmsMessage(m, 'outbound')) }
  }
  for (const m of (inbound.messages ?? []) as Record<string, string | null>[]) {
    if (m.sid && !seen.has(m.sid)) { seen.add(m.sid); messages.push(toSmsMessage(m, 'inbound')) }
  }
  return messages
}

/**
 * Groups messages into per-contact conversations — the "other party" is
 * `to` for an outbound message and `from` for an inbound one. Threads are
 * keyed by `phoneDigitsKey` so the same customer texting from `+614…` and
 * `04…` still lands in one thread, and sorted most-recently-active first;
 * each thread's own messages are chronological (oldest first), matching a
 * normal chat reading order.
 */
export function groupIntoThreads(messages: SmsMessage[]): SmsThread[] {
  const byPhone = new Map<string, SmsMessage[]>()
  for (const m of messages) {
    const otherRaw = m.direction === 'outbound' ? m.to : m.from
    const key = phoneDigitsKey(otherRaw)
    if (!byPhone.has(key)) byPhone.set(key, [])
    byPhone.get(key)!.push(m)
  }

  const threads: SmsThread[] = []
  for (const [phone, msgs] of byPhone) {
    const sorted = [...msgs].sort((a, b) => (a.dateSent ?? '').localeCompare(b.dateSent ?? ''))
    const last = sorted[sorted.length - 1]
    const displayPhone = last.direction === 'outbound' ? last.to : last.from
    threads.push({ phone, displayPhone, messages: sorted })
  }

  return threads.sort((a, b) => {
    const aLast = a.messages[a.messages.length - 1].dateSent ?? ''
    const bLast = b.messages[b.messages.length - 1].dateSent ?? ''
    return bLast.localeCompare(aLast)
  })
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

/**
 * `0432 118 774` / `+61432118774` / `432118774` → `+61432118774` — Vapi's
 * transfer destination (and similar telephony APIs) require strict E.164,
 * but numbers typed into a plain "Number to transfer calls to" form field
 * are naturally local AU format (`0…`). Falls back to the raw input,
 * `+`-prefixed, for anything that isn't a 9-digit AU number rather than
 * silently producing a bogus number.
 */
export function toE164Au(phone: string): string {
  const digits = phoneDigitsKey(phone)
  if (digits.length !== 9) return phone.startsWith('+') ? phone : `+${phone.replace(/\D/g, '')}`
  return `+61${digits}`
}
