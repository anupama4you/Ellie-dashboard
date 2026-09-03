import { describe, expect, it } from 'vitest'
import { estimatedLinkedRevenueCents } from './revenue'

describe('estimatedLinkedRevenueCents', () => {
  it('is zero when the business has not configured a conversion rate', () => {
    expect(estimatedLinkedRevenueCents(10, null, 10000)).toBe(0)
  })

  it('is zero when the business has not configured an average customer value', () => {
    expect(estimatedLinkedRevenueCents(10, 40, null)).toBe(0)
  })

  it('is zero when neither is configured', () => {
    expect(estimatedLinkedRevenueCents(10, null, null)).toBe(0)
  })

  it('is zero with zero linked calls, even if both settings are configured', () => {
    expect(estimatedLinkedRevenueCents(0, 40, 10000)).toBe(0)
  })

  it('applies count * conversion rate * average value', () => {
    // 10 linked calls, 40% conversion, $100 average value -> 10 * 0.4 * 10000 = 40000 cents
    expect(estimatedLinkedRevenueCents(10, 40, 10000)).toBe(40000)
  })

  it('rounds to the nearest cent', () => {
    // 3 calls * 0.33 * 10000 = 9900 exactly, but pick numbers that don't divide evenly
    expect(estimatedLinkedRevenueCents(7, 33, 12345)).toBe(Math.round(7 * 0.33 * 12345))
  })

  it('treats a 0% conversion rate as configured but yielding zero revenue', () => {
    expect(estimatedLinkedRevenueCents(10, 0, 10000)).toBe(0)
  })

  it('treats a 100% conversion rate as full value per call', () => {
    expect(estimatedLinkedRevenueCents(5, 100, 8000)).toBe(5 * 8000)
  })
})
