import { describe, expect, it } from 'vitest'
import { isWithinOutboundCallingWindow } from './outboundWindow'

describe('isWithinOutboundCallingWindow', () => {
  const timeZone = 'Australia/Adelaide'

  it('allows a time inside the window', () => {
    // 2026-01-15T00:00:00Z is 10:30am in Adelaide (ACDT, UTC+10:30 in January)
    const inside = new Date('2026-01-15T00:00:00.000Z')
    expect(isWithinOutboundCallingWindow(inside, timeZone)).toBe(true)
  })

  it('blocks a time before 9am', () => {
    // 2026-01-14T21:30:00Z is 8:00am in Adelaide the next day
    const early = new Date('2026-01-14T21:30:00.000Z')
    expect(isWithinOutboundCallingWindow(early, timeZone)).toBe(false)
  })

  it('blocks a time at or after 8pm', () => {
    // 2026-01-15T09:30:00Z is 8:00pm in Adelaide the same day
    const late = new Date('2026-01-15T09:30:00.000Z')
    expect(isWithinOutboundCallingWindow(late, timeZone)).toBe(false)
  })

  it('uses the business timezone, not UTC', () => {
    // 2026-01-15T10:30:00Z is 9:00pm in Adelaide (blocked) but 10:30am in UTC (allowed)
    const instant = new Date('2026-01-15T10:30:00.000Z')
    expect(isWithinOutboundCallingWindow(instant, 'Australia/Adelaide')).toBe(false)
    expect(isWithinOutboundCallingWindow(instant, 'UTC')).toBe(true)
  })
})
