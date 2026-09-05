import { describe, expect, it } from 'vitest'
import { resolveSelectedBusinessId } from './business'

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
