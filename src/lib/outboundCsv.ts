import Papa from 'papaparse'
import { toE164Au } from '@/lib/sms'

export type ParsedContact = { name: string; phone: string; note: string | null; extra: Record<string, string> }

export type ParseContactsResult = {
  valid: ParsedContact[]
  skipped: number
}

const AU_E164 = /^\+61\d{9}$/
const RESERVED_COLUMNS = new Set(['name', 'phone', 'note'])

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
 * A CSV column header, turned into a safe {{variable}} name Vapi can
 * actually substitute: lowercase, non-alphanumeric runs collapsed to a
 * single underscore, no leading/trailing underscore. "Last Visit" ->
 * "last_visit". Used both when parsing rows (to key each contact's extra
 * fields) and when a client is offered "insert this as a variable" buttons
 * before upload even completes — both call sites must agree on the exact
 * name, or a button's {{token}} wouldn't match what actually gets sent.
 */
export function sanitizeVariableKey(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/**
 * Parses an uploaded contacts CSV. Expected columns: name, phone, and an
 * optional note — any OTHER column is captured too, under its sanitized
 * name, in `extra` (e.g. a "Last Visit" column becomes extra.last_visit).
 * `extra` is passed through as Vapi call variables, so a client can
 * reference any of their own spreadsheet columns in the opening line or
 * system prompt as {{column_name}}, personalized per contact.
 *
 * A row missing name/phone, whose phone doesn't look like a genuine AU
 * number, or whose normalized phone doesn't resolve to a valid AU E.164
 * number, is skipped and counted rather than silently dropped without
 * explanation — the caller reports the skipped count back to the client.
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

    const extra: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) {
      if (RESERVED_COLUMNS.has(key)) continue
      const trimmedValue = value?.trim()
      if (!trimmedValue) continue
      extra[sanitizeVariableKey(key)] = trimmedValue
    }

    valid.push({ name, phone, note: row.note?.trim() || null, extra })
  }

  return { valid, skipped }
}

/**
 * The sanitized variable names a CSV's extra columns would produce,
 * without validating/parsing any actual rows — cheap enough to run
 * client-side the moment a file is chosen, so "insert a personal detail"
 * buttons can appear before the file is even uploaded.
 */
export function extractCustomVariableNames(csvText: string): string[] {
  const { meta } = Papa.parse(csvText, { header: true, preview: 1 })
  const headers = (meta?.fields ?? []).map(h => h.trim().toLowerCase())
  const names = headers.filter(h => !RESERVED_COLUMNS.has(h)).map(sanitizeVariableKey).filter(Boolean)
  return [...new Set(names)]
}
