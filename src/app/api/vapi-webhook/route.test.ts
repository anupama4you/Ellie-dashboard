import { beforeAll, describe, expect, it, vi } from 'vitest'
import { toE164Au } from '@/lib/sms'
import { dateStrInZone, zonedTimeToUtc } from '@/lib/timezone'
import type { FakeSupabase } from '@/test/fakeSupabase'

/**
 * Smoke tests for the money paths through the Vapi webhook: book,
 * reschedule, cancel, transfer. Not full coverage — just enough that a
 * regression in these flows can't ship silently. DB is an in-memory fake
 * (src/test/fakeSupabase.ts); everything genuinely external is mocked.
 */

vi.mock('@supabase/supabase-js', async () => {
  const { FakeSupabase } = await import('@/test/fakeSupabase')
  const instance = new FakeSupabase()
  return { createClient: () => instance }
})

vi.mock('@/lib/twilio', () => ({
  sendSms: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/googleCalendar', () => ({
  getValidAccessToken: vi.fn().mockResolvedValue(null),
  freeBusyQuery: vi.fn(),
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
}))

vi.mock('@/lib/customers', () => ({
  rememberCustomerName: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/monitoring', () => ({
  captureError: vi.fn(),
}))

const HOURS = {
  mon: { open: true, opensAt: '09:00', closesAt: '17:00' },
  tue: { open: true, opensAt: '09:00', closesAt: '17:00' },
  wed: { open: true, opensAt: '09:00', closesAt: '17:00' },
  thu: { open: true, opensAt: '09:00', closesAt: '17:00' },
  fri: { open: true, opensAt: '09:00', closesAt: '17:00' },
  sat: { open: false, opensAt: '09:00', closesAt: '17:00' },
  sun: { open: false, opensAt: '09:00', closesAt: '17:00' },
}

function business(overrides: Record<string, unknown>) {
  return {
    name: 'Luxe Nails & Beauty',
    hours: HOURS,
    twilio_phone_number: '+61400000000',
    timezone: 'Australia/Sydney',
    address: '1 Test St',
    city: 'Sydney',
    state: 'NSW',
    postcode: '2000',
    google_maps_url: null,
    transfer_phone_number: null,
    ...overrides,
  }
}

/**
 * A future weekday instant N days out, nudged past any weekend so it always
 * falls within the fixed Mon-Fri HOURS fixture above. A hardcoded literal
 * calendar date would eventually become "the past" as real time moves on —
 * which the deliberate isWithinOpenHours() past-time rejection then
 * (correctly) rejects, breaking these tests for reasons that have nothing
 * to do with what they're actually testing.
 */
function futureWeekdayIso(daysAhead: number, localHHMM: string, tz = 'Australia/Sydney'): string {
  let d = new Date(Date.now() + daysAhead * 24 * 60 * 60_000)
  while (['Sat', 'Sun'].includes(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d))) {
    d = new Date(d.getTime() + 24 * 60 * 60_000)
  }
  const [y, mo, day] = dateStrInZone(d, tz).split('-').map(Number)
  const [h, m] = localHHMM.split(':').map(Number)
  return zonedTimeToUtc(tz, y, mo, day, h, m).toISOString()
}

let fakeSupabase: FakeSupabase
let sendSms: ReturnType<typeof vi.fn>
let POST: typeof import('./route').POST

beforeAll(async () => {
  delete process.env.VAPI_WEBHOOK_SECRET // exercise the business logic, not the auth gate — that's covered separately

  const supabaseModule = await import('@supabase/supabase-js')
  fakeSupabase = (supabaseModule.createClient as unknown as () => FakeSupabase)()

  const twilioModule = await import('@/lib/twilio')
  sendSms = twilioModule.sendSms as unknown as ReturnType<typeof vi.fn>

  ;({ POST } = await import('./route'))
})

function toolCallRequest(assistantId: string, callId: string, toolName: string, args: Record<string, unknown>, customerNumber?: string) {
  return new Request('http://localhost/api/vapi-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        type: 'tool-calls',
        call: { assistantId, id: callId, customer: customerNumber ? { number: customerNumber } : undefined },
        toolCallList: [{ id: 'tc-1', name: toolName, arguments: args }],
      },
    }),
  })
}

/**
 * Shaped like a real webhook payload from Vapi's browser-based Chat test
 * tool — confirmed via a live diagnostic dump, not guessed: no `call` key at
 * all; the assistant reference lives under a top-level `assistant` object
 * instead (keys observed: timestamp/type/toolCalls/toolCallList/
 * toolWithToolCallList/artifact/chat/assistant).
 */
function chatToolCallRequest(assistantId: string, toolName: string, args: Record<string, unknown>) {
  return new Request('http://localhost/api/vapi-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        type: 'tool-calls',
        assistant: { id: assistantId },
        chat: { id: 'chat-1' },
        toolCallList: [{ id: 'tc-1', name: toolName, arguments: args }],
      },
    }),
  })
}

describe('bookAppointment', () => {
  it('books an appointment and sends a confirmation SMS', async () => {
    fakeSupabase.seed('businesses', [{ id: 'biz-book-1', vapi_assistant_id: 'asst-book-1', ...business({}) }])
    fakeSupabase.seed('business_services', [{ business_id: 'biz-book-1', name: 'Manicure', duration_minutes: 45 }])

    const req = toolCallRequest('asst-book-1', 'call-1', 'bookAppointment', {
      customerName: 'Jane Doe',
      customerPhone: '0400111222',
      service: 'Manicure',
      dateTime: futureWeekdayIso(10, '14:00'),
    })

    const res = await POST(req)
    const json = await res.json()

    expect(json.results[0].result).toMatch(/^Booked Manicure for Jane Doe on/)
    expect(sendSms).toHaveBeenCalledWith('0400111222', expect.stringContaining('Manicure'), '+61400000000')

    const rows = fakeSupabase.rows('appointments').filter(r => r.business_id === 'biz-book-1')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'confirmed', customer_name: 'Jane Doe', service: 'Manicure' })
  })

  it('recovers with an apology instead of a dead-end when the slot was just taken', async () => {
    fakeSupabase.seed('businesses', [{ id: 'biz-book-2', vapi_assistant_id: 'asst-book-2', ...business({}) }])
    fakeSupabase.seed('business_services', [{ business_id: 'biz-book-2', name: 'Manicure', duration_minutes: 45 }])
    const conflictTime = futureWeekdayIso(11, '15:00')
    // Simulate another caller having already booked this exact slot.
    fakeSupabase.seed('appointments', [{
      id: 'apt-existing', business_id: 'biz-book-2', service: 'Manicure',
      customer_name: 'Other Customer', customer_phone: '0499888777',
      scheduled_at: conflictTime, status: 'confirmed',
    }])

    const req = toolCallRequest('asst-book-2', 'call-2', 'bookAppointment', {
      customerName: 'Jane Doe',
      customerPhone: '0400111222',
      service: 'Manicure',
      dateTime: conflictTime,
    })

    const res = await POST(req)
    const json = await res.json()

    expect(json.results[0].result).toMatch(/^That time was just/)
    // No duplicate row should have been created for the conflicting slot.
    const rows = fakeSupabase.rows('appointments').filter(r => r.business_id === 'biz-book-2' && r.status !== 'cancelled')
    expect(rows).toHaveLength(1)
  })
})

describe('bookAppointment with a staff roster', () => {
  it('books two different staff members at the identical slot', async () => {
    fakeSupabase.seed('businesses', [{ id: 'biz-staff-1', vapi_assistant_id: 'asst-staff-1', ...business({}) }])
    fakeSupabase.seed('business_services', [{ business_id: 'biz-staff-1', name: 'Cut', duration_minutes: 30 }])
    fakeSupabase.seed('business_staff', [
      { id: 'staff-alice', business_id: 'biz-staff-1', name: 'Alice', active: true, hours: null },
      { id: 'staff-bob', business_id: 'biz-staff-1', name: 'Bob', active: true, hours: null },
    ])

    const dateTime = futureWeekdayIso(12, '14:00')
    const reqAlice = toolCallRequest('asst-staff-1', 'call-staff-1a', 'bookAppointment', {
      customerName: 'Jane Doe', customerPhone: '0400111222', service: 'Cut', dateTime, staffMember: 'Alice',
    })
    const reqBob = toolCallRequest('asst-staff-1', 'call-staff-1b', 'bookAppointment', {
      customerName: 'John Roe', customerPhone: '0400333444', service: 'Cut', dateTime, staffMember: 'Bob',
    })

    const resAlice = await POST(reqAlice)
    const jsonAlice = await resAlice.json()
    const resBob = await POST(reqBob)
    const jsonBob = await resBob.json()

    expect(jsonAlice.results[0].result).toMatch(/^Booked Cut for Jane Doe with Alice on/)
    expect(jsonBob.results[0].result).toMatch(/^Booked Cut for John Roe with Bob on/)

    const rows = fakeSupabase.rows('appointments').filter(r => r.business_id === 'biz-staff-1' && r.status !== 'cancelled')
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.staff_id).sort()).toEqual(['staff-alice', 'staff-bob'])
  })

  it('still conflicts when the same staff member is booked twice at the same slot', async () => {
    fakeSupabase.seed('businesses', [{ id: 'biz-staff-2', vapi_assistant_id: 'asst-staff-2', ...business({}) }])
    fakeSupabase.seed('business_services', [{ business_id: 'biz-staff-2', name: 'Cut', duration_minutes: 30 }])
    fakeSupabase.seed('business_staff', [{ id: 'staff-carol', business_id: 'biz-staff-2', name: 'Carol', active: true, hours: null }])
    const carolTime = futureWeekdayIso(13, '15:00')
    fakeSupabase.seed('appointments', [{
      id: 'apt-carol-existing', business_id: 'biz-staff-2', service: 'Cut', staff_id: 'staff-carol',
      customer_name: 'Existing Customer', customer_phone: '0499888777',
      scheduled_at: carolTime, status: 'confirmed',
    }])

    const req = toolCallRequest('asst-staff-2', 'call-staff-2', 'bookAppointment', {
      customerName: 'Jane Doe', customerPhone: '0400111222', service: 'Cut',
      dateTime: carolTime, staffMember: 'Carol',
    })

    const res = await POST(req)
    const json = await res.json()

    expect(json.results[0].result).toMatch(/^That time was just/)
    const rows = fakeSupabase.rows('appointments').filter(r => r.business_id === 'biz-staff-2' && r.status !== 'cancelled')
    expect(rows).toHaveLength(1)
  })
})

describe('checkAvailability with a per-date staff availability override', () => {
  it('never offers a date where the staff member has an "unavailable" override, even though business hours are open that day', async () => {
    // Every day open, so the assertion below doesn't depend on which day of the week "tomorrow" happens to be.
    const allOpenHours = {
      mon: { open: true, opensAt: '00:00', closesAt: '23:59' },
      tue: { open: true, opensAt: '00:00', closesAt: '23:59' },
      wed: { open: true, opensAt: '00:00', closesAt: '23:59' },
      thu: { open: true, opensAt: '00:00', closesAt: '23:59' },
      fri: { open: true, opensAt: '00:00', closesAt: '23:59' },
      sat: { open: true, opensAt: '00:00', closesAt: '23:59' },
      sun: { open: true, opensAt: '00:00', closesAt: '23:59' },
    }
    const tz = 'Australia/Sydney'
    const tomorrowKey = dateStrInZone(new Date(Date.now() + 24 * 60 * 60_000), tz)

    fakeSupabase.seed('businesses', [{ id: 'biz-avail-1', vapi_assistant_id: 'asst-avail-1', ...business({ hours: allOpenHours, timezone: tz }) }])
    fakeSupabase.seed('business_staff', [{ id: 'staff-dana', business_id: 'biz-avail-1', name: 'Dana', active: true, hours: null }])
    fakeSupabase.seed('business_staff_availability', [
      { staff_id: 'staff-dana', date: tomorrowKey, is_available: false, opens_at: null, closes_at: null },
    ])

    const req = toolCallRequest('asst-avail-1', 'call-avail-1', 'checkAvailability', { staffMember: 'Dana' })
    const res = await POST(req)
    const json = await res.json()
    const resultText = json.results[0].result as string

    const isoTimestamps = [...resultText.matchAll(/\(([^)]+)\)/g)].map(m => m[1])
    expect(isoTimestamps.length).toBeGreaterThan(0) // sanity check the tool actually returned slots at all
    for (const iso of isoTimestamps) {
      expect(dateStrInZone(new Date(iso), tz)).not.toBe(tomorrowKey)
    }
  })
})

describe('checkAvailability with preferredDate', () => {
  it('checks the caller\'s named day instead of always returning the soonest slots', async () => {
    const allOpenHours = {
      mon: { open: true, opensAt: '00:00', closesAt: '23:59' },
      tue: { open: true, opensAt: '00:00', closesAt: '23:59' },
      wed: { open: true, opensAt: '00:00', closesAt: '23:59' },
      thu: { open: true, opensAt: '00:00', closesAt: '23:59' },
      fri: { open: true, opensAt: '00:00', closesAt: '23:59' },
      sat: { open: true, opensAt: '00:00', closesAt: '23:59' },
      sun: { open: true, opensAt: '00:00', closesAt: '23:59' },
    }
    const tz = 'Australia/Sydney'
    // Five days out — clear of "today" so a bug that ignores preferredDate and just returns the soonest slots is caught.
    const preferredDate = dateStrInZone(new Date(Date.now() + 5 * 24 * 60 * 60_000), tz)

    fakeSupabase.seed('businesses', [{ id: 'biz-pref-1', vapi_assistant_id: 'asst-pref-1', ...business({ hours: allOpenHours, timezone: tz }) }])

    const req = toolCallRequest('asst-pref-1', 'call-pref-1', 'checkAvailability', { preferredDate })
    const res = await POST(req)
    const json = await res.json()
    const resultText = json.results[0].result as string

    const isoTimestamps = [...resultText.matchAll(/\(([^)]+)\)/g)].map(m => m[1])
    expect(isoTimestamps.length).toBeGreaterThan(0)
    for (const iso of isoTimestamps) {
      expect(dateStrInZone(new Date(iso), tz)).toBe(preferredDate)
    }
    expect(resultText).not.toMatch(/nothing was open on the caller's preferred date/i)
  })

  it('offers the closest alternative and flags it when the preferred date has nothing open', async () => {
    const closedFriday = {
      mon: { open: true, opensAt: '00:00', closesAt: '23:59' },
      tue: { open: true, opensAt: '00:00', closesAt: '23:59' },
      wed: { open: true, opensAt: '00:00', closesAt: '23:59' },
      thu: { open: true, opensAt: '00:00', closesAt: '23:59' },
      fri: { open: false, opensAt: '00:00', closesAt: '23:59' },
      sat: { open: true, opensAt: '00:00', closesAt: '23:59' },
      sun: { open: true, opensAt: '00:00', closesAt: '23:59' },
    }
    const tz = 'Australia/Sydney'
    // Find the next actual Friday from "now" so the closed-day config lines up with the date under test.
    let preferredDate = dateStrInZone(new Date(Date.now() + 24 * 60 * 60_000), tz)
    for (let i = 0; i < 8; i++) {
      const d = new Date(`${preferredDate}T12:00:00.000Z`)
      if (new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d) === 'Fri') break
      preferredDate = dateStrInZone(new Date(d.getTime() + 24 * 60 * 60_000), tz)
    }

    fakeSupabase.seed('businesses', [{ id: 'biz-pref-2', vapi_assistant_id: 'asst-pref-2', ...business({ hours: closedFriday, timezone: tz }) }])

    const req = toolCallRequest('asst-pref-2', 'call-pref-2', 'checkAvailability', { preferredDate })
    const res = await POST(req)
    const json = await res.json()
    const resultText = json.results[0].result as string

    const isoTimestamps = [...resultText.matchAll(/\(([^)]+)\)/g)].map(m => m[1])
    expect(isoTimestamps.length).toBeGreaterThan(0)
    for (const iso of isoTimestamps) {
      expect(dateStrInZone(new Date(iso), tz)).not.toBe(preferredDate) // Friday is closed, so nothing should land on it
    }
    expect(resultText).toMatch(/nothing was open on the caller's preferred date/i)
  })
})

describe('checkAvailability caches Google Calendar free/busy', () => {
  it('reuses the free/busy result across consecutive calls, and refetches once a booking invalidates it', async () => {
    const googleModule = await import('@/lib/googleCalendar')
    const getValidAccessToken = googleModule.getValidAccessToken as unknown as ReturnType<typeof vi.fn>
    const freeBusyQuery = googleModule.freeBusyQuery as unknown as ReturnType<typeof vi.fn>
    const createCalendarEvent = googleModule.createCalendarEvent as unknown as ReturnType<typeof vi.fn>

    getValidAccessToken.mockResolvedValue({ accessToken: 'test-token', calendarId: 'cal-cache-1' })
    freeBusyQuery.mockResolvedValue([])
    createCalendarEvent.mockResolvedValue({ id: 'evt-cache-1', htmlLink: 'https://calendar.google.com/evt-cache-1' })

    fakeSupabase.seed('businesses', [{ id: 'biz-cache-1', vapi_assistant_id: 'asst-cache-1', ...business({}) }])
    fakeSupabase.seed('business_services', [{ business_id: 'biz-cache-1', name: 'Manicure', duration_minutes: 30 }])

    const check = () => POST(toolCallRequest('asst-cache-1', 'call-cache-1', 'checkAvailability', {}))

    try {
      await check()
      expect(freeBusyQuery).toHaveBeenCalledTimes(1)

      await check()
      expect(freeBusyQuery).toHaveBeenCalledTimes(1) // cache hit — no second network call

      const bookRes = await POST(toolCallRequest('asst-cache-1', 'call-cache-1b', 'bookAppointment', {
        customerName: 'Jane Doe', customerPhone: '0400111222', service: 'Manicure',
        dateTime: futureWeekdayIso(20, '14:00'),
      }))
      const bookJson = await bookRes.json()
      expect(bookJson.results[0].result).toMatch(/^Booked Manicure for Jane Doe on/)

      await check()
      expect(freeBusyQuery).toHaveBeenCalledTimes(2) // the booking's calendar mutation invalidated the cache
    } finally {
      // Restore the file's shared mocks to their original defaults so later tests aren't affected.
      getValidAccessToken.mockResolvedValue(null)
      freeBusyQuery.mockReset()
      createCalendarEvent.mockReset()
    }
  })
})

describe('checkAvailability from a chat-shaped request (no call object)', () => {
  it('still resolves the business via the top-level assistantId', async () => {
    fakeSupabase.seed('businesses', [{ id: 'biz-chat-1', vapi_assistant_id: 'asst-chat-1', ...business({}) }])
    fakeSupabase.seed('business_services', [{ business_id: 'biz-chat-1', name: 'Manicure', duration_minutes: 30 }])

    const req = chatToolCallRequest('asst-chat-1', 'checkAvailability', {})
    const res = await POST(req)
    const json = await res.json()

    expect(json.results[0].result).not.toMatch(/couldn't reach the calendar/)
  })
})

describe('rescheduleAppointment', () => {
  it('moves the appointment and sends an updated confirmation SMS', async () => {
    fakeSupabase.seed('businesses', [{ id: 'biz-resch-1', vapi_assistant_id: 'asst-resch-1', ...business({}) }])
    fakeSupabase.seed('business_services', [{ business_id: 'biz-resch-1', name: 'Pedicure', duration_minutes: 60 }])
    const newTime = futureWeekdayIso(15, '15:00')
    fakeSupabase.seed('appointments', [{
      id: 'apt-resch-1', business_id: 'biz-resch-1', service: 'Pedicure',
      customer_name: 'John Smith', customer_phone: '0400333444',
      scheduled_at: futureWeekdayIso(14, '14:00'), status: 'confirmed', calendar_event_id: null,
    }])

    const req = toolCallRequest('asst-resch-1', 'call-resch-1', 'rescheduleAppointment', {
      appointmentId: 'apt-resch-1',
      newDateTime: newTime,
    })

    const res = await POST(req)
    const json = await res.json()

    expect(json.results[0].result).toMatch(/^Rescheduled Pedicure for John Smith to/)
    expect(sendSms).toHaveBeenCalledWith('0400333444', expect.stringContaining('moved'), '+61400000000')

    const row = fakeSupabase.rows('appointments').find(r => r.id === 'apt-resch-1')
    expect(row).toMatchObject({ status: 'rescheduled', scheduled_at: newTime })
  })
})

describe('cancelAppointment', () => {
  it('cancels the appointment and sends a cancellation SMS', async () => {
    fakeSupabase.seed('businesses', [{ id: 'biz-cancel-1', vapi_assistant_id: 'asst-cancel-1', ...business({}) }])
    fakeSupabase.seed('appointments', [{
      id: 'apt-cancel-1', business_id: 'biz-cancel-1', service: 'Haircut',
      customer_name: 'Amy Lee', customer_phone: '0400555666',
      scheduled_at: futureWeekdayIso(16, '12:00'), status: 'confirmed', calendar_event_id: null,
    }])

    const req = toolCallRequest('asst-cancel-1', 'call-cancel-1', 'cancelAppointment', {
      appointmentId: 'apt-cancel-1',
    })

    const res = await POST(req)
    const json = await res.json()

    expect(json.results[0].result).toBe('Cancelled the Haircut appointment for Amy Lee.')
    expect(sendSms).toHaveBeenCalledWith('0400555666', expect.stringContaining('cancelled'), '+61400000000')

    const row = fakeSupabase.rows('appointments').find(r => r.id === 'apt-cancel-1')
    expect(row).toMatchObject({ status: 'cancelled' })
  })
})

describe('transfer-destination-request', () => {
  function transferRequest(assistantId: string) {
    return new Request('http://localhost/api/vapi-webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: { type: 'transfer-destination-request', call: { assistantId } } }),
    })
  }

  it('returns the transfer number in E.164 when one is configured', async () => {
    fakeSupabase.seed('businesses', [{
      id: 'biz-transfer-1', vapi_assistant_id: 'asst-transfer-1',
      ...business({ transfer_phone_number: '0400777888' }),
    }])

    const res = await POST(transferRequest('asst-transfer-1'))
    const json = await res.json()

    expect(json.destination).toMatchObject({
      type: 'number',
      number: toE164Au('0400777888'),
      transferPlan: { mode: 'warm-transfer-say-summary' },
    })
  })

  it('tells the assistant to take a message when no transfer number is configured', async () => {
    fakeSupabase.seed('businesses', [{
      id: 'biz-transfer-2', vapi_assistant_id: 'asst-transfer-2',
      ...business({ transfer_phone_number: null }),
    }])

    const res = await POST(transferRequest('asst-transfer-2'))
    const json = await res.json()

    expect(json.destination).toBeUndefined()
    expect(json.error).toMatch(/take a message/)
  })
})
