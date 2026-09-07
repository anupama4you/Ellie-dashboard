import { describe, expect, it } from 'vitest'
import { parseContactsCsv, extractCustomVariableNames, parseManualContact } from './outboundCsv'

describe('parseContactsCsv', () => {
  it('parses valid rows with name, phone, and note', () => {
    const csv = 'name,phone,note\nJane Doe,0412345678,Last visited March\nJohn Roe,0498765432,'
    const result = parseContactsCsv(csv)
    expect(result.valid).toEqual([
      { name: 'Jane Doe', phone: '+61412345678', note: 'Last visited March', extra: {} },
      { name: 'John Roe', phone: '+61498765432', note: null, extra: {} },
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
    expect(result.valid).toEqual([{ name: 'Jane Doe', phone: '+61412345678', note: null, extra: {} }])
  })

  it('skips an international phone number that toE164Au could otherwise mangle into a different real AU number', () => {
    const csv = 'name,phone\nJane Doe,+1 212 555 1234'
    const result = parseContactsCsv(csv)
    expect(result.valid).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('skips a phone number with an extension', () => {
    const csv = 'name,phone\nJane Doe,0412 345 678 x12'
    const result = parseContactsCsv(csv)
    expect(result.valid).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('accepts a plausible AU number without the + prefix', () => {
    const csv = 'name,phone\nJane Doe,61412345678'
    const result = parseContactsCsv(csv)
    expect(result.valid).toEqual([{ name: 'Jane Doe', phone: '+61412345678', note: null, extra: {} }])
  })

  it('captures any extra columns as sanitized, usable variable names', () => {
    const csv = 'name,phone,Last Visit,Loyalty Tier\nJane Doe,0412345678,March,Gold'
    const result = parseContactsCsv(csv)
    expect(result.valid).toEqual([{
      name: 'Jane Doe',
      phone: '+61412345678',
      note: null,
      extra: { last_visit: 'March', loyalty_tier: 'Gold' },
    }])
  })

  it('omits an extra column that is blank for a given row', () => {
    const csv = 'name,phone,favorite_service\nJane Doe,0412345678,\nJohn Roe,0498765432,Haircut'
    const result = parseContactsCsv(csv)
    expect(result.valid).toEqual([
      { name: 'Jane Doe', phone: '+61412345678', note: null, extra: {} },
      { name: 'John Roe', phone: '+61498765432', note: null, extra: { favorite_service: 'Haircut' } },
    ])
  })
})

describe('parseManualContact', () => {
  it('accepts a valid hand-typed contact', () => {
    expect(parseManualContact('Jane Doe', '0412345678', 'Prefers afternoons')).toEqual({
      name: 'Jane Doe', phone: '+61412345678', note: 'Prefers afternoons', extra: {},
    })
  })

  it('returns null for a blank name or phone', () => {
    expect(parseManualContact('', '0412345678', '')).toBeNull()
    expect(parseManualContact('Jane Doe', '', '')).toBeNull()
  })

  it('returns null for an unresolvable phone number, same as the CSV path', () => {
    expect(parseManualContact('Jane Doe', '12345', '')).toBeNull()
  })

  it('treats a blank note as null', () => {
    expect(parseManualContact('Jane Doe', '0412345678', '  ')).toEqual({
      name: 'Jane Doe', phone: '+61412345678', note: null, extra: {},
    })
  })
})

describe('extractCustomVariableNames', () => {
  it('returns sanitized names for every column beyond name/phone/note', () => {
    const csv = 'name,phone,note,Last Visit,Loyalty Tier\nJane Doe,0412345678,,March,Gold'
    expect(extractCustomVariableNames(csv)).toEqual(['last_visit', 'loyalty_tier'])
  })

  it('returns an empty array when there are no extra columns', () => {
    const csv = 'name,phone,note\nJane Doe,0412345678,'
    expect(extractCustomVariableNames(csv)).toEqual([])
  })
})
