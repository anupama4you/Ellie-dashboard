import { describe, expect, it } from 'vitest'
import { isOwnedBusinessId, resolveSelectedBusinessId } from './business'

describe('resolveSelectedBusinessId', () => {
  const businesses = [
    { id: 'a' },
    { id: 'b' },
    { id: 'c' },
  ]

  it('returns null when there are no businesses', () => {
    expect(resolveSelectedBusinessId([], 'a')).toBeNull()
  })

  it('returns the oldest (first) business when no cookie is set', () => {
    expect(resolveSelectedBusinessId(businesses, undefined)).toBe('a')
  })

  it('returns the cookie value when it matches one of the businesses', () => {
    expect(resolveSelectedBusinessId(businesses, 'b')).toBe('b')
  })

  it('falls back to the oldest business when the cookie references a business not in the list', () => {
    expect(resolveSelectedBusinessId(businesses, 'not-owned-or-deleted')).toBe('a')
  })

  it('falls back to the only business for a single-location user even with a stale cookie', () => {
    expect(resolveSelectedBusinessId([{ id: 'only' }], 'some-other-id')).toBe('only')
  })
})

describe('resolveSelectedBusinessId — disabled locations', () => {
  it('skips a disabled cookie-selected business in favor of a non-disabled one', () => {
    const businesses = [
      { id: 'a', account_disabled: true },
      { id: 'b', account_disabled: false },
    ]
    expect(resolveSelectedBusinessId(businesses, 'a')).toBe('b')
  })

  it('falls back to the oldest non-disabled business when no cookie is set and the first is disabled', () => {
    const businesses = [
      { id: 'a', account_disabled: true },
      { id: 'b', account_disabled: false },
    ]
    expect(resolveSelectedBusinessId(businesses, undefined)).toBe('b')
  })

  it('still resolves to a disabled business when every business is disabled', () => {
    const businesses = [
      { id: 'a', account_disabled: true },
      { id: 'b', account_disabled: true },
    ]
    expect(resolveSelectedBusinessId(businesses, 'a')).toBe('a')
  })

  it('treats a business with no account_disabled field as not disabled', () => {
    expect(resolveSelectedBusinessId([{ id: 'a' }], undefined)).toBe('a')
  })
})

describe('isOwnedBusinessId', () => {
  const businesses = [{ id: 'a' }, { id: 'b' }]

  it('returns true when the id belongs to one of the businesses', () => {
    expect(isOwnedBusinessId(businesses, 'b')).toBe(true)
  })

  it('returns false when the id does not belong to any of the businesses', () => {
    expect(isOwnedBusinessId(businesses, 'z')).toBe(false)
  })

  it('returns false for an empty list', () => {
    expect(isOwnedBusinessId([], 'a')).toBe(false)
  })
})
