import type { Hours } from '@/app/(dashboard)/briefing/actions'

const DAY_KEYS: (keyof Hours)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const DEFAULT_DURATION_MINUTES = 30
const SLOT_STEP_MINUTES = 30
const MIN_LEAD_MINUTES = 30
const MAX_DAYS_AHEAD = 14
const DEFAULT_SLOT_COUNT = 3

type ServiceRow = { name: string; duration_minutes: number | null }
type ExistingAppointment = { scheduled_at: string; service: string | null }

function durationFor(serviceName: string | null | undefined, services: ServiceRow[]): number {
  if (!serviceName) return DEFAULT_DURATION_MINUTES
  const match = services.find(s => s.name.toLowerCase() === serviceName.toLowerCase())
  return match?.duration_minutes ?? DEFAULT_DURATION_MINUTES
}

function parseTimeOnDate(base: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(base)
  d.setHours(h, m, 0, 0)
  return d
}

/**
 * Walks forward day by day (respecting business hours) looking for gaps that
 * don't overlap any existing appointment. Appointments don't store their own
 * end time, so each one's occupied window is derived from its service's
 * duration (or a default) the same way a candidate slot's would be.
 */
export function findNextAvailableSlots(opts: {
  hours: Hours
  services: ServiceRow[]
  existing: ExistingAppointment[]
  requestedService?: string | null
  now?: Date
  count?: number
}): Date[] {
  const now = opts.now ?? new Date()
  const duration = durationFor(opts.requestedService, opts.services)
  const wantCount = opts.count ?? DEFAULT_SLOT_COUNT
  const earliestStart = new Date(now.getTime() + MIN_LEAD_MINUTES * 60_000)

  const busy = opts.existing.map(a => {
    const start = new Date(a.scheduled_at)
    const end = new Date(start.getTime() + durationFor(a.service, opts.services) * 60_000)
    return { start, end }
  })

  const slots: Date[] = []

  for (let dayOffset = 0; dayOffset <= MAX_DAYS_AHEAD && slots.length < wantCount; dayOffset++) {
    const day = new Date(now)
    day.setDate(day.getDate() + dayOffset)
    const dayHours = opts.hours[DAY_KEYS[day.getDay()]]
    if (!dayHours.open) continue

    const close = parseTimeOnDate(day, dayHours.closesAt)
    const candidate = parseTimeOnDate(day, dayHours.opensAt)

    while (candidate.getTime() + duration * 60_000 <= close.getTime()) {
      if (candidate >= earliestStart) {
        const candidateEnd = new Date(candidate.getTime() + duration * 60_000)
        const overlaps = busy.some(b => candidate < b.end && b.start < candidateEnd)
        if (!overlaps) {
          slots.push(new Date(candidate))
          if (slots.length >= wantCount) break
        }
      }
      candidate.setMinutes(candidate.getMinutes() + SLOT_STEP_MINUTES)
    }
  }

  return slots
}

export function formatSlot(d: Date): string {
  return d.toLocaleString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
}
