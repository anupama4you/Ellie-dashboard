import { describe, expect, it } from 'vitest'
import { groupIntoThreads, type SmsMessage } from './sms'

function msg(overrides: Partial<SmsMessage>): SmsMessage {
  return {
    sid: 'SM1',
    from: '+61432118774',
    to: '+61280000000',
    body: 'hi',
    status: 'delivered',
    direction: 'inbound',
    dateSent: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('groupIntoThreads', () => {
  it('groups an inbound and outbound message with the same customer into one thread', () => {
    const threads = groupIntoThreads([
      msg({ sid: 'SM1', direction: 'inbound', from: '+61432118774', to: '+61280000000', dateSent: '2026-09-01T00:00:00.000Z' }),
      msg({ sid: 'SM2', direction: 'outbound', from: '+61280000000', to: '+61432118774', dateSent: '2026-09-01T00:05:00.000Z' }),
    ])
    expect(threads).toHaveLength(1)
    expect(threads[0].messages.map(m => m.sid)).toEqual(['SM1', 'SM2'])
  })

  it('groups messages together across different formatting of the same number', () => {
    const threads = groupIntoThreads([
      msg({ sid: 'SM1', direction: 'inbound', from: '+61432118774' }),
      msg({ sid: 'SM2', direction: 'inbound', from: '0432118774' }),
    ])
    expect(threads).toHaveLength(1)
    expect(threads[0].messages).toHaveLength(2)
  })

  it('orders messages within a thread oldest first', () => {
    const threads = groupIntoThreads([
      msg({ sid: 'SM2', dateSent: '2026-09-02T00:00:00.000Z' }),
      msg({ sid: 'SM1', dateSent: '2026-09-01T00:00:00.000Z' }),
    ])
    expect(threads[0].messages.map(m => m.sid)).toEqual(['SM1', 'SM2'])
  })

  it('orders threads by most recent message first', () => {
    const threads = groupIntoThreads([
      msg({ sid: 'SM1', from: '+61432118774', dateSent: '2026-09-01T00:00:00.000Z' }),
      msg({ sid: 'SM2', from: '+61411111111', dateSent: '2026-09-03T00:00:00.000Z' }),
      msg({ sid: 'SM3', from: '+61422222222', dateSent: '2026-09-02T00:00:00.000Z' }),
    ])
    expect(threads.map(t => t.messages[0].sid)).toEqual(['SM2', 'SM3', 'SM1'])
  })

  it('uses the outbound "to" as the display phone when the thread has an outbound message', () => {
    const threads = groupIntoThreads([
      msg({ sid: 'SM1', direction: 'outbound', from: '+61280000000', to: '+61432118774' }),
    ])
    expect(threads[0].displayPhone).toBe('+61432118774')
  })

  it('uses the inbound "from" as the display phone for an inbound-only thread', () => {
    const threads = groupIntoThreads([
      msg({ sid: 'SM1', direction: 'inbound', from: '+61432118774', to: '+61280000000' }),
    ])
    expect(threads[0].displayPhone).toBe('+61432118774')
  })

  it('returns an empty array for no messages', () => {
    expect(groupIntoThreads([])).toEqual([])
  })
})
