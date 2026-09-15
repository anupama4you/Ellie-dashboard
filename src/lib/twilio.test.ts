import { describe, expect, it } from 'vitest'
import { toGsm7Safe } from './twilio'

describe('toGsm7Safe', () => {
  it('leaves plain GSM-7 text untouched', () => {
    const text = "Hi Sarah, your appointment is confirmed for Mon 2pm. Reply STOP to opt out."
    expect(toGsm7Safe(text)).toBe(text)
  })

  it('normalizes smart quotes, em/en dashes, and ellipsis to GSM-7 equivalents', () => {
    const text = 'It’s “ready” – come by — we’ll wait…'
    expect(toGsm7Safe(text)).toBe('It\'s "ready" - come by - we\'ll wait...')
  })

  it('strips characters with no GSM-7 equivalent (e.g. emoji) rather than sending them as Unicode', () => {
    expect(toGsm7Safe('See you soon 😀!')).toBe('See you soon !')
  })

  it('keeps GSM-7 extended-alphabet characters like the euro sign', () => {
    expect(toGsm7Safe('Total: €45')).toBe('Total: €45')
  })
})
