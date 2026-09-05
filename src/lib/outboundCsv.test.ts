import { describe, expect, it } from 'vitest'
import { parseContactsCsv } from './outboundCsv'

describe('parseContactsCsv', () => {
  it('parses valid rows with name, phone, and note', () => {
    const csv = 'name,phone,note\nJane Doe,0412345678,Last visited March\nJohn Roe,0498765432,'
    const result = parseContactsCsv(csv)
    expect(result.valid).toEqual([
      { name: 'Jane Doe', phone: '+61412345678', note: 'Last visited March' },
      { name: 'John Roe', phone: '+61498765432', note: null },
    ])
    expect(result.skipped).toBe(0)
  })

  it('skips a row missing a name', () => {
    const csv = 'name,phone\n,0412345678'
    const result = parseContactsCsv(csv)
    expect(result.valid).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('skips a row missing a phone', () => {
    const csv = 'name,phone\nJane Doe,'
    const result = parseContactsCsv(csv)
    expect(result.valid).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('skips a row with an unresolvable phone number', () => {
    const csv = 'name,phone\nJane Doe,12345'
    const result = parseContactsCsv(csv)
    expect(result.valid).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('is case-insensitive and trims header names', () => {
    const csv = ' Name , Phone \nJane Doe,0412345678'
    const result = parseContactsCsv(csv)
    expect(result.valid).toEqual([{ name: 'Jane Doe', phone: '+61412345678', note: null }])
  })
})
