import { describe, expect, it } from 'vitest'
import { categoryStyle, classifyCall } from './callClassify'

describe('categoryStyle', () => {
  it('returns the same label/colors classifyCall uses for a booked call', () => {
    expect(categoryStyle('booked')).toEqual({ label: 'Booked', color: 'var(--signal)', bg: 'var(--signal-soft)' })
  })

  it('returns the same label/colors classifyCall uses for a missed call', () => {
    expect(categoryStyle('missed')).toEqual({ label: 'No answer', color: 'var(--coral)', bg: 'var(--coral-soft)' })
  })

  it('returns the same label/colors classifyCall uses for a declined call', () => {
    expect(categoryStyle('declined')).toEqual({ label: 'Declined', color: 'var(--ink-3)', bg: 'var(--paper)' })
  })

  it('falls back to a neutral style for an unrecognised category', () => {
    expect(categoryStyle('not-a-real-category')).toEqual({ label: 'not-a-real-category', color: 'var(--ink-3)', bg: 'var(--paper)' })
  })
})

describe('classifyCall — declined', () => {
  it('classifies as declined when hasDeclined is true and nothing more specific happened', () => {
    expect(classifyCall(undefined, false, false, false, true).category).toBe('declined')
  })

  it('falls back to enquiry when hasDeclined is not passed, same as before this category existed', () => {
    expect(classifyCall(undefined, false, false, false).category).toBe('enquiry')
  })

  it('a real booking still wins over a stray hasDeclined signal', () => {
    expect(classifyCall(undefined, true, false, false, true).category).toBe('booked')
  })

  it('a sent booking link still wins over hasDeclined', () => {
    expect(classifyCall(undefined, false, false, true, true).category).toBe('linked')
  })

  it('a no-answer ended reason still wins over hasDeclined', () => {
    expect(classifyCall('customer-did-not-answer', false, false, false, true).category).toBe('missed')
  })
})
