import type { Hours } from '@/app/(dashboard)/briefing/actions'
import { zonedTimeToUtc, dateStrInZone, dayOfWeekInZone, formatInZone } from '@/lib/timezone'

const DAY_KEYS: (keyof Hours)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const DEFAULT_DURATION_MINUTES = 30
const SLOT_STEP_MINUTES = 30
const MIN_LEAD_MINUTES = 30
const MAX_DAYS_AHEAD = 14
const DEFAULT_SLOT_COUNT = 3

type ServiceRow = { name: string; duration_minutes: number | null }
type ExistingAppointment = { scheduled_at: string; service: string | null; staff_id?: string | null }
type StaffDateOverride = { isAvailable: boolean; opensAt: string | null; closesAt: string | null }

export function durationFor(serviceName: string | null | undefined, services: ServiceRow[]): number {
  if (!serviceName) return DEFAULT_DURATION_MINUTES
  const match = services.find(s => s.name.toLowerCase() === serviceName.toLowerCase())
  return match?.duration_minutes ?? DEFAULT_DURATION_MINUTES
}

/** Narrower of two windows on the same day — later open, earlier close; closed if either side is closed. */
function intersectDayHours(a: Hours[keyof Hours], b: Hours[keyof Hours]): Hours[keyof Hours] {
  if (!a.open || !b.open) return { open: false, opensAt: a.opensAt, closesAt: a.closesAt }
  return {
    open: true,
    opensAt: a.opensAt > b.opensAt ? a.opensAt : b.opensAt,
    closesAt: a.closesAt < b.closesAt ? a.closesAt : b.closesAt,
  }
}

/**
 * Walks forward day by day (respecting business hours, in the business's own
 * timezone — not the server's) looking for gaps that don't overlap any
 * existing appointment. Appointments don't store their own end time, so each
 * one's occupied window is derived from its service's duration (or a
 * default) the same way a candidate slot's would be.
 */
export function findNextAvailableSlots(opts: {
  hours: Hours
  services: ServiceRow[]
  existing: ExistingAppointment[]
  requestedService?: string | null
  now?: Date
  count?: number
  /** Busy intervals from a connected external calendar (e.g. Google free/busy) — merged in alongside our own appointments. */
  externalBusy?: { start: Date; end: Date }[]
  /** IANA timezone the business actually operates in, e.g. "Australia/Adelaide". */
  timeZone: string
  /** Tri-state staff filter: undefined = unfiltered, null = only unassigned appointments, id = only that staff's. */
  staffId?: string | null
  /** A resolved staff member's own weekly template, intersected with `hours` each day. null/omitted = same as business hours. */
  staffHours?: Hours | null
  /** Per-date overrides (keyed `YYYY-MM-DD` in `timeZone`) — takes precedence over `staffHours` and `hours` for that date. */
  staffAvailabilityByDate?: Map<string, StaffDateOverride>
  /**
   * A specific calendar date (`YYYY-MM-DD`, in `timeZone`) the caller asked
   * about — e.g. "do you have anything Thursday?". When given, the walk
   * starts at that date instead of today, so a day the caller explicitly
   * named is actually checked (and offered first if open) rather than
   * always being crowded out by whatever's soonest. Falls through to the
   * normal today-first walk if it's missing, unparseable, in the past, or
   * beyond the search window — never an error, just no preference applied.
   */
  preferredDate?: string | null
}): Date[] {
  const now = opts.now ?? new Date()
  const duration = durationFor(opts.requestedService, opts.services)
  const wantCount = opts.count ?? DEFAULT_SLOT_COUNT
  const earliestStart = new Date(now.getTime() + MIN_LEAD_MINUTES * 60_000)

  const existing = opts.staffId === undefined
    ? opts.existing
    : opts.existing.filter(a => (a.staff_id ?? null) === opts.staffId)

  const busy = [
    ...existing.map(a => {
      const start = new Date(a.scheduled_at)
      const end = new Date(start.getTime() + durationFor(a.service, opts.services) * 60_000)
      return { start, end }
    }),
    ...(opts.externalBusy ?? []),
  ]

  const slots: Date[] = []

  // "Today" as a calendar date (Y-M-D) in the business's own timezone — once
  // we have that, subsequent days are pure calendar-date arithmetic (a
  // Y-M-D's day-of-week doesn't depend on timezone), only converted to a real
  // instant via zonedTimeToUtc when we need actual open/close timestamps.
  const [ty, tm, td] = dateStrInZone(now, opts.timeZone).split('-').map(Number)
  const todayCalendarMs = Date.UTC(ty, tm - 1, td)

  // A well-formed preferred date within the search window shifts where the
  // walk starts; anything else (past, malformed, too far out) is silently
  // ignored rather than rejected, so a caller's date preference can never
  // itself cause a hard failure.
  let startOffset = 0
  const preferredMatch = opts.preferredDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (preferredMatch) {
    const preferredMs = Date.UTC(Number(preferredMatch[1]), Number(preferredMatch[2]) - 1, Number(preferredMatch[3]))
    const offset = Math.round((preferredMs - todayCalendarMs) / 86_400_000)
    if (offset > 0 && offset <= MAX_DAYS_AHEAD) startOffset = offset
  }

  for (let dayOffset = startOffset; dayOffset <= MAX_DAYS_AHEAD && slots.length < wantCount; dayOffset++) {
    const dayCalendar = new Date(todayCalendarMs + dayOffset * 86_400_000)
    const y = dayCalendar.getUTCFullYear()
    const mo = dayCalendar.getUTCMonth() + 1
    const d = dayCalendar.getUTCDate()
    const dow = dayCalendar.getUTCDay()

    let dayHours = opts.hours[DAY_KEYS[dow]]
    if (opts.staffHours) dayHours = intersectDayHours(dayHours, opts.staffHours[DAY_KEYS[dow]])

    const dateKey = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const override = opts.staffAvailabilityByDate?.get(dateKey)
    if (override) {
      dayHours = override.isAvailable && override.opensAt && override.closesAt
        ? intersectDayHours(opts.hours[DAY_KEYS[dow]], { open: true, opensAt: override.opensAt, closesAt: override.closesAt })
        : { open: false, opensAt: dayHours.opensAt, closesAt: dayHours.closesAt }
    }

    if (!dayHours.open) continue

    const [openH, openM] = dayHours.opensAt.split(':').map(Number)
    const [closeH, closeM] = dayHours.closesAt.split(':').map(Number)
    const close = zonedTimeToUtc(opts.timeZone, y, mo, d, closeH, closeM)
    const candidate = zonedTimeToUtc(opts.timeZone, y, mo, d, openH, openM)

    while (candidate.getTime() + duration * 60_000 <= close.getTime()) {
      if (candidate >= earliestStart) {
        const candidateEnd = new Date(candidate.getTime() + duration * 60_000)
        const overlaps = busy.some(b => candidate < b.end && b.start < candidateEnd)
        if (!overlaps) {
          slots.push(new Date(candidate))
          if (slots.length >= wantCount) break
        }
      }
      candidate.setTime(candidate.getTime() + SLOT_STEP_MINUTES * 60_000)
    }
  }

  return slots
}

export function formatSlot(d: Date, timeZone: string): string {
  return formatInZone(d, timeZone, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
}

/** Whether `date` falls outside the business's configured hours for its day of week. */
export function isAfterHours(date: Date, hours: Hours | null | undefined, timeZone: string): boolean {
  if (!hours) return false
  const day = hours[DAY_KEYS[dayOfWeekInZone(date, timeZone)]]
  if (!day?.open) return true
  const hhmm = formatInZone(date, timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return hhmm < day.opensAt || hhmm >= day.closesAt
}
