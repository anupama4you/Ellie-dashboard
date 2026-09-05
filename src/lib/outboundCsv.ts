import Papa from 'papaparse'
import { toE164Au } from '@/lib/sms'

export type ParsedContact = { name: string; phone: string; note: string | null }

export type ParseContactsResult = {
  valid: ParsedContact[]
  skipped: number
}

const AU_E164 = /^\+61\d{9}$/

/**
 * Parses an uploaded contacts CSV. Expected columns: name, phone, and an
 * optional note. A row missing name/phone, or whose phone doesn't resolve
 * to a valid AU E.164 number, is skipped and counted rather than silently
 * dropped without explanation — the caller reports the skipped count back
 * to the client.
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

    const phone = toE164Au(rawPhone)
    if (!AU_E164.test(phone)) { skipped++; continue }

    valid.push({ name, phone, note: row.note?.trim() || null })
  }

  return { valid, skipped }
}
