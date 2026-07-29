import { beforeAll, describe, expect, it, vi } from 'vitest'
import { toE164Au } from '@/lib/sms'
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

describe('bookAppointment', () => {
  it('books an appointment and sends a confirmation SMS', async () => {
    fakeSupabase.seed('businesses', [{ id: 'biz-book-1', vapi_assistant_id: 'asst-book-1', ...business({}) }])
    fakeSupabase.seed('business_services', [{ business_id: 'biz-book-1', name: 'Manicure', duration_minutes: 45 }])

    const req = toolCallRequest('asst-book-1', 'call-1', 'bookAppointment', {
      customerName: 'Jane Doe',
      customerPhone: '0400111222',
      service: 'Manicure',
      dateTime: '2026-08-03T04:00:00.000Z',
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
    // Simulate another caller having already booked this exact slot.
    fakeSupabase.seed('appointments', [{
      id: 'apt-existing', business_id: 'biz-book-2', service: 'Manicure',
      customer_name: 'Other Customer', customer_phone: '0499888777',
      scheduled_at: '2026-08-03T05:00:00.000Z', status: 'confirmed',
    }])

    const req = toolCallRequest('asst-book-2', 'call-2', 'bookAppointment', {
      customerName: 'Jane Doe',
      customerPhone: '0400111222',
      service: 'Manicure',
      dateTime: '2026-08-03T05:00:00.000Z',
    })

    const res = await POST(req)
    const json = await res.json()

    expect(json.results[0].result).toMatch(/^That time was just/)
    // No duplicate row should have been created for the conflicting slot.
    const rows = fakeSupabase.rows('appointments').filter(r => r.business_id === 'biz-book-2' && r.status !== 'cancelled')
    expect(rows).toHaveLength(1)
  })
})

describe('rescheduleAppointment', () => {
  it('moves the appointment and sends an updated confirmation SMS', async () => {
    fakeSupabase.seed('businesses', [{ id: 'biz-resch-1', vapi_assistant_id: 'asst-resch-1', ...business({}) }])
    fakeSupabase.seed('business_services', [{ business_id: 'biz-resch-1', name: 'Pedicure', duration_minutes: 60 }])
    fakeSupabase.seed('appointments', [{
      id: 'apt-resch-1', business_id: 'biz-resch-1', service: 'Pedicure',
      customer_name: 'John Smith', customer_phone: '0400333444',
      scheduled_at: '2026-08-04T04:00:00.000Z', status: 'confirmed', calendar_event_id: null,
    }])

    const req = toolCallRequest('asst-resch-1', 'call-resch-1', 'rescheduleAppointment', {
      appointmentId: 'apt-resch-1',
      newDateTime: '2026-08-05T05:00:00.000Z',
    })

    const res = await POST(req)
    const json = await res.json()

    expect(json.results[0].result).toMatch(/^Rescheduled Pedicure for John Smith to/)
    expect(sendSms).toHaveBeenCalledWith('0400333444', expect.stringContaining('moved'), '+61400000000')

    const row = fakeSupabase.rows('appointments').find(r => r.id === 'apt-resch-1')
    expect(row).toMatchObject({ status: 'rescheduled', scheduled_at: '2026-08-05T05:00:00.000Z' })
  })
})

describe('cancelAppointment', () => {
  it('cancels the appointment and sends a cancellation SMS', async () => {
    fakeSupabase.seed('businesses', [{ id: 'biz-cancel-1', vapi_assistant_id: 'asst-cancel-1', ...business({}) }])
    fakeSupabase.seed('appointments', [{
      id: 'apt-cancel-1', business_id: 'biz-cancel-1', service: 'Haircut',
      customer_name: 'Amy Lee', customer_phone: '0400555666',
      scheduled_at: '2026-08-06T02:00:00.000Z', status: 'confirmed', calendar_event_id: null,
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
