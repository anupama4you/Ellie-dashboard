import { describe, expect, it } from 'vitest'
import { resolveOutboundPhoneNumberId, type VapiPhoneNumber } from './vapi'

describe('resolveOutboundPhoneNumberId', () => {
  const phoneNumbers: VapiPhoneNumber[] = [
    { id: 'vapi-pn-1', number: '+61812345678' },
    { id: 'vapi-pn-2', number: '+61887654321' },
  ]

  it('returns the id of the matching phone number', () => {
    expect(resolveOutboundPhoneNumberId(phoneNumbers, '+61887654321')).toBe('vapi-pn-2')
  })

  it('returns null when no phone number matches', () => {
    expect(resolveOutboundPhoneNumberId(phoneNumbers, '+61800000000')).toBeNull()
  })

  it('returns null for an empty list', () => {
    expect(resolveOutboundPhoneNumberId([], '+61887654321')).toBeNull()
  })
})
