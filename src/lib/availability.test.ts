import { describe, expect, it } from 'vitest'
import { findNextAvailableSlots, encodeSlotRef, decodeSlotRef, isStaffEligibleForService } from './availability'
import { dateStrInZone } from '@/lib/timezone'
import type { Hours } from '@/app/(dashboard)/briefing/actions'

const ALL_OPEN: Hours = {
  mon: { open: true, opensAt: '09:00', closesAt: '17:00' },
  tue: { open: true, opensAt: '09:00', closesAt: '17:00' },
  wed: { open: true, opensAt: '09:00', closesAt: '17:00' },
  thu: { open: true, opensAt: '09:00', closesAt: '17:00' },
  fri: { open: true, opensAt: '09:00', closesAt: '17:00' },
  sat: { open: true, opensAt: '09:00', closesAt: '17:00' },
  sun: { open: true, opensAt: '09:00', closesAt: '17:00' },
}

const TZ = 'Australia/Sydney'
// A fixed, known Monday well clear of any DST edge — every "day N" in these
// tests is unambiguous regardless of when the suite actually runs.
const NOW = new Date('2026-08-17T00:00:00.000Z') // Mon 2026-08-17 10:00 AEST

// Local (business-timezone) calendar date N days after NOW's local date —
// matches how the function itself walks days, not raw UTC date slicing
// (Sydney is UTC+10, so a local-morning slot's ISO string is still on the
// *previous* UTC calendar date).
function dayKey(offset: number): string {
  const localMidnightToday = new Date(`${dateStrInZone(NOW, TZ)}T12:00:00.000Z`) // noon UTC is safely mid-day in every zone
  const d = new Date(localMidnightToday.getTime() + offset * 86_400_000)
  return dateStrInZone(d, TZ)
}

function localDateOf(iso: string): string {
  return dateStrInZone(new Date(iso), TZ)
}

// A UTC instant for a given local wall-clock time on day-offset N.
function localInstant(offset: number, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const key = dayKey(offset)
  const [y, mo, d] = key.split('-').map(Number)
  // Sydney is UTC+10 in August (no DST) — safe to hardcode for this fixed test window.
  const utcHour = h - 10
  const utc = new Date(Date.UTC(y, mo - 1, d, utcHour, m))
  return utc.toISOString()
}

describe('findNextAvailableSlots — staff filtering and hours intersection', () => {
  it('with no staffId, a busy block applies regardless of which staff it belongs to (today\'s behavior)', () => {
    const slots = findNextAvailableSlots({
      hours: ALL_OPEN,
      services: [{ name: 'Long', duration_minutes: 8 * 60 }],
      // Covers all of today's remaining business hours (10:00-18:00 AEST), owned by a different staff member.
      existing: [{ scheduled_at: localInstant(0, '10:00'), service: 'Long', staff_id: 'someone-else' }],
      now: NOW,
      count: 1,
      timeZone: TZ,
    })
    // Unfiltered — the busy block still pushes the first available slot to the next day.
    expect(localDateOf(slots[0].toISOString())).toBe(dayKey(1))
  })

  it('with a real staffId, a different staff member\'s appointment does not block the slot', () => {
    const conflictSlot = localInstant(0, '15:00') // within business hours today
    const slots = findNextAvailableSlots({
      hours: ALL_OPEN,
      services: [],
      existing: [{ scheduled_at: conflictSlot, service: null, staff_id: 'other-staff' }],
      now: NOW,
      count: 30,
      staffId: 'my-staff',
      timeZone: TZ,
    })
    expect(slots.some(s => s.toISOString() === conflictSlot)).toBe(true)
  })

  it('intersects staffHours with business hours — narrower of the two wins', () => {
    // Only Tuesday open at the business level, so every returned slot is unambiguously on the day under test regardless of how many other days would otherwise have filled the count.
    const CLOSED = { open: false, opensAt: '09:00', closesAt: '17:00' }
    const onlyTuesday: Hours = { mon: CLOSED, tue: ALL_OPEN.tue, wed: CLOSED, thu: CLOSED, fri: CLOSED, sat: CLOSED, sun: CLOSED }
    const narrowerStaffHours: Hours = { ...ALL_OPEN, tue: { open: true, opensAt: '13:00', closesAt: '14:00' } }
    const slots = findNextAvailableSlots({
      hours: onlyTuesday,
      services: [],
      existing: [],
      now: NOW,
      count: 2, // exactly Tuesday's 13:00 and 13:30 slots — stops before reaching the following week's Tuesday
      staffHours: narrowerStaffHours,
      timeZone: TZ,
    })
    expect(slots.length).toBeGreaterThan(0)
    for (const s of slots) {
      expect(localDateOf(s.toISOString())).toBe(dayKey(1))
      expect(s.toISOString() >= localInstant(1, '13:00') && s.toISOString() < localInstant(1, '14:00')).toBe(true)
    }
  })

  it('a day the staff member has closed (via staffHours) yields no slots that day even though the business is open', () => {
    const staffOffTuesday: Hours = { ...ALL_OPEN, tue: { open: false, opensAt: '09:00', closesAt: '17:00' } }
    const slots = findNextAvailableSlots({
      hours: ALL_OPEN,
      services: [],
      existing: [],
      now: NOW,
      count: 20,
      staffHours: staffOffTuesday,
      timeZone: TZ,
    })
    expect(slots.some(s => localDateOf(s.toISOString()) === dayKey(1))).toBe(false)
  })

  it('a per-date "unavailable" override removes that day even though the weekly template and business hours are both open', () => {
    const overrides = new Map([[dayKey(2), { isAvailable: false, opensAt: null, closesAt: null }]])
    const slots = findNextAvailableSlots({
      hours: ALL_OPEN,
      services: [],
      existing: [],
      now: NOW,
      count: 20,
      staffAvailabilityByDate: overrides,
      timeZone: TZ,
    })
    expect(slots.some(s => localDateOf(s.toISOString()) === dayKey(2))).toBe(false)
  })

  it('a per-date override wins over a weekly staffHours template that closes that day, and is itself capped by business hours', () => {
    // Only Thursday open at the business level, so the assertion below is unambiguous no matter what count is passed.
    const CLOSED = { open: false, opensAt: '09:00', closesAt: '17:00' }
    const onlyThursday: Hours = { mon: CLOSED, tue: CLOSED, wed: CLOSED, thu: ALL_OPEN.thu, fri: CLOSED, sat: CLOSED, sun: CLOSED }
    const staffHours: Hours = { ...ALL_OPEN, thu: { open: false, opensAt: '09:00', closesAt: '17:00' } }
    // The weekly template has Thursday closed entirely; the override opens it for this specific date — capped at business close (17:00), even though the override itself asks for 20:00.
    const overrides = new Map([[dayKey(3), { isAvailable: true, opensAt: '16:00', closesAt: '20:00' }]])
    const slots = findNextAvailableSlots({
      hours: onlyThursday,
      services: [],
      existing: [],
      now: NOW,
      count: 2, // exactly this Thursday's 16:00 and 16:30 slots — stops before reaching the following week's Thursday
      staffHours,
      staffAvailabilityByDate: overrides,
      timeZone: TZ,
    })
    expect(slots.length).toBeGreaterThan(0)
    for (const s of slots) {
      expect(localDateOf(s.toISOString())).toBe(dayKey(3))
      expect(s.toISOString() >= localInstant(3, '16:00') && s.toISOString() < localInstant(3, '17:00')).toBe(true)
    }
  })
})

describe('findNextAvailableSlots — preferredDate', () => {
  it('starts the search at the preferred date instead of today, when that date is open', () => {
    const slots = findNextAvailableSlots({
      hours: ALL_OPEN,
      services: [],
      existing: [],
      now: NOW,
      count: 3,
      preferredDate: dayKey(3), // Thursday — well after today (Monday)
      timeZone: TZ,
    })
    expect(slots.length).toBe(3)
    for (const s of slots) expect(localDateOf(s.toISOString())).toBe(dayKey(3))
  })

  it('falls through to later days when the preferred date itself has nothing open', () => {
    // Business closed on the preferred day (Thursday) — should offer Friday instead of going all the way back to today.
    const closedThursday: Hours = { ...ALL_OPEN, thu: { open: false, opensAt: '09:00', closesAt: '17:00' } }
    const slots = findNextAvailableSlots({
      hours: closedThursday,
      services: [],
      existing: [],
      now: NOW,
      count: 1,
      preferredDate: dayKey(3),
      timeZone: TZ,
    })
    expect(slots.length).toBe(1)
    expect(localDateOf(slots[0].toISOString())).toBe(dayKey(4)) // Friday
  })

  it('ignores a preferred date in the past and searches from today as usual', () => {
    const slots = findNextAvailableSlots({
      hours: ALL_OPEN,
      services: [],
      existing: [],
      now: NOW,
      count: 1,
      preferredDate: dayKey(-1), // yesterday
      timeZone: TZ,
    })
    expect(slots.length).toBe(1)
    expect(localDateOf(slots[0].toISOString())).toBe(dayKey(0))
  })

  it('ignores a malformed preferred date rather than erroring', () => {
    const slots = findNextAvailableSlots({
      hours: ALL_OPEN,
      services: [],
      existing: [],
      now: NOW,
      count: 1,
      preferredDate: 'next thursday',
      timeZone: TZ,
    })
    expect(slots.length).toBe(1)
    expect(localDateOf(slots[0].toISOString())).toBe(dayKey(0))
  })
})

describe('isStaffEligibleForService', () => {
  const services = [
    { name: 'Colour', duration_minutes: 90, staff_ids: ['staff-sarah', 'staff-jessica'] },
    { name: 'Haircut', duration_minutes: 30, staff_ids: null },
    { name: 'Massage', duration_minutes: 60, staff_ids: [] },
  ]

  it('restricts a service with staff_ids to only those staff', () => {
    expect(isStaffEligibleForService('staff-sarah', 'Colour', services)).toBe(true)
    expect(isStaffEligibleForService('staff-brian', 'Colour', services)).toBe(false)
  })

  it('matches the service name case-insensitively', () => {
    expect(isStaffEligibleForService('staff-brian', 'COLOUR', services)).toBe(false)
    expect(isStaffEligibleForService('staff-sarah', 'colour', services)).toBe(true)
  })

  it('is unrestricted when staff_ids is null (no restriction configured)', () => {
    expect(isStaffEligibleForService('staff-brian', 'Haircut', services)).toBe(true)
  })

  it('is unrestricted when staff_ids is an empty array', () => {
    expect(isStaffEligibleForService('staff-brian', 'Massage', services)).toBe(true)
  })

  it('is unrestricted when no service name is given', () => {
    expect(isStaffEligibleForService('staff-brian', undefined, services)).toBe(true)
    expect(isStaffEligibleForService('staff-brian', null, services)).toBe(true)
  })

  it('is unrestricted when the named service has no matching row', () => {
    expect(isStaffEligibleForService('staff-brian', 'Nonexistent Service', services)).toBe(true)
  })
})

describe('encodeSlotRef / decodeSlotRef', () => {
  it('round-trips an instant with a staff id', () => {
    const ref = encodeSlotRef('2026-08-27T02:30:00.000Z', 'staff-sarah')
    expect(decodeSlotRef(ref)).toEqual({ iso: '2026-08-27T02:30:00Z', staffId: 'staff-sarah' })
  })

  it('round-trips an instant with no staff id (null)', () => {
    const ref = encodeSlotRef('2026-08-27T02:30:00.000Z', null)
    expect(decodeSlotRef(ref)).toEqual({ iso: '2026-08-27T02:30:00Z', staffId: null })
  })

  it('returns null for malformed base64', () => {
    expect(decodeSlotRef('!!!not-base64!!!')).toBeNull()
  })

  it('returns null when the decoded payload has no separator', () => {
    const noSeparator = Buffer.from('2026-08-27T02:30:00Z', 'utf8').toString('base64url')
    expect(decodeSlotRef(noSeparator)).toBeNull()
  })

  it('returns null when the date half does not parse', () => {
    const badDate = Buffer.from('not-a-date|staff-sarah', 'utf8').toString('base64url')
    expect(decodeSlotRef(badDate)).toBeNull()
  })
})
