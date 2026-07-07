/**
 * Timezone-aware date helpers built on `Intl.DateTimeFormat` — no library
 * needed, Node ships the full IANA tz database. Every business operates in
 * its own timezone (`businesses.timezone`), which is almost never the same
 * as the server process's local timezone (production runs in UTC), so any
 * plain `Date.setHours()`/`toLocaleString()` without an explicit `timeZone`
 * silently uses the wrong one.
 */

/** The real UTC offset (in minutes, positive = ahead of UTC) for `timeZone` at the instant `date`. DST-correct. */
function getUtcOffsetMinutes(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value

  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return Math.round((asUtc - date.getTime()) / 60_000)
}

/** Given a wall-clock date/time meant to be read *in* `timeZone`, returns the true UTC instant. */
export function zonedTimeToUtc(timeZone: string, y: number, mo: number, d: number, h: number, mi: number): Date {
  const naiveUtcMs = Date.UTC(y, mo - 1, d, h, mi, 0)
  const offsetMin = getUtcOffsetMinutes(timeZone, new Date(naiveUtcMs))
  return new Date(naiveUtcMs - offsetMin * 60_000)
}

/** Formats a UTC instant as wall-clock text in `timeZone` — use instead of bare `toLocaleString`/`toLocaleTimeString`/`toLocaleDateString`. */
export function formatInZone(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleString('en-AU', { ...options, timeZone })
}

/** `YYYY-MM-DD` for `date` as a calendar day *in* `timeZone` — timezone-aware replacement for `localDateStr()`. */
export function dateStrInZone(date: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  return dtf.format(date) // en-CA formats as YYYY-MM-DD
}

/** 0=Sunday..6=Saturday for `date`, evaluated *in* `timeZone` — timezone-aware replacement for `Date.getDay()`. */
export function dayOfWeekInZone(date: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday)
}

/** Wall-clock hour (0-23) for `date`, evaluated *in* `timeZone` — timezone-aware replacement for `Date.getHours()`. */
export function hourInZone(date: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(date))
}

/** The UTC instant for 00:00:00 on `date`'s calendar day, *in* `timeZone` — timezone-aware replacement for `d.setHours(0,0,0,0)`. */
export function startOfDayInZone(date: Date, timeZone: string): Date {
  const [y, mo, d] = dateStrInZone(date, timeZone).split('-').map(Number)
  return zonedTimeToUtc(timeZone, y, mo, d, 0, 0)
}

/**
 * The UTC instant for 00:00:00, `days` calendar days after `date`'s day *in*
 * `timeZone` — DST-safe day arithmetic. Unlike `Date.setDate()` (which
 * shifts by a fixed number of 24h blocks and can drift across a DST
 * boundary), this re-derives midnight in the target zone for the shifted
 * calendar date.
 */
export function addDaysInZone(date: Date, days: number, timeZone: string): Date {
  const [y, mo, d] = dateStrInZone(date, timeZone).split('-').map(Number)
  const shifted = new Date(Date.UTC(y, mo - 1, d + days))
  return zonedTimeToUtc(timeZone, shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), 0, 0)
}

/** `YYYY-MM-DD` shifted by `days` calendar days — pure calendar arithmetic, timezone-agnostic (a calendar date's neighbor doesn't depend on timezone). */
export function shiftDateStr(dateStr: string, days: number): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, mo - 1, d + days))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}
