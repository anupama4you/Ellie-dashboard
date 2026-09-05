import Papa from 'papaparse'
import { toE164Au } from '@/lib/sms'

export type ParsedContact = { name: string; phone: string; note: string | null }

export type ParseContactsResult = {
  valid: ParsedContact[]
  skipped: number
}

const AU_E164 = /^\+61\d{9}$/

/**
 * Whether a raw CSV cell looks like a genuine AU phone number, checked
 * BEFORE any normalization. toE164Au() is a lossy best-effort transform (it
 * takes the last 9 digits of whatever it's given) built for a single
 * admin-typed field — running it on an international number, a number with
 * an extension, or other garbage can silently produce a *different, real*
 * AU number that then passes a post-normalization regex check. This checks
 * the input's own shape (only 0XXXXXXXXX, 61XXXXXXXXX, or +61XXXXXXXXX,
 * ignoring spaces/dashes/parens) and never mutates it.
 */
function isPlausibleAuPhone(raw: string): boolean {
  const cleaned = raw.replace(/[\s\-()]/g, '')
  return /^(?:\+61|61|0)\d{9}$/.test(cleaned)
}

/**
 * Parses an uploaded contacts CSV. Expected columns: name, phone, and an
 * optional note. A row missing name/phone, whose phone doesn't look like a
 * genuine AU number, or whose normalized phone doesn't resolve to a valid
 * AU E.164 number, is skipped and counted rather than silently dropped
 * without explanation — the caller reports the skipped count back to the
 * client.
 */
export function parseContactsCsv(csvText: string): ParseContactsResult {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  const valid: ParsedContact[] = []
  let skipped = 0

  for (const row of data) {
    const name = row.name?.trim()
    const rawPhone = row.phone?.trim()
    if (!name || !rawPhone) { skipped++; continue }

    if (!isPlausibleAuPhone(rawPhone)) { skipped++; continue }

    const phone = toE164Au(rawPhone)
    if (!AU_E164.test(phone)) { skipped++; continue }

    valid.push({ name, phone, note: row.note?.trim() || null })
  }

  return { valid, skipped }
}
