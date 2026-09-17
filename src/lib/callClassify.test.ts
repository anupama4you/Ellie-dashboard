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

  it('returns the same label/colors classifyCall uses for a review-requested call', () => {
    expect(categoryStyle('reviewRequested')).toEqual({ label: 'Review requested', color: 'var(--signal)', bg: 'var(--signal-soft)' })
  })

  it('returns the same label/colors classifyCall uses for a callback-requested call', () => {
    expect(categoryStyle('callbackRequested')).toEqual({ label: 'Callback requested', color: 'var(--amber)', bg: 'var(--amber-soft)' })
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

describe('classifyCall — reviewRequested', () => {
  it('classifies as reviewRequested when hasReviewRequested is true and nothing more specific happened', () => {
    expect(classifyCall(undefined, false, false, false, false, true).category).toBe('reviewRequested')
  })

  it('takes priority over hasDeclined — a call that got a review link sent was not declined', () => {
    expect(classifyCall(undefined, false, false, false, true, true).category).toBe('reviewRequested')
  })

  it('a sent booking link still wins over hasReviewRequested', () => {
    expect(classifyCall(undefined, false, false, true, false, true).category).toBe('linked')
  })

  it('a real booking still wins over hasReviewRequested', () => {
    expect(classifyCall(undefined, true, false, false, false, true).category).toBe('booked')
  })
})

describe('classifyCall — callbackRequested', () => {
  it('classifies as callbackRequested when hasCallbackRequested is true and nothing more specific happened', () => {
    expect(classifyCall(undefined, false, false, false, false, false, true).category).toBe('callbackRequested')
  })

  it('takes priority over hasDeclined — a call where the team was asked to call back was not declined', () => {
    expect(classifyCall(undefined, false, false, false, true, false, true).category).toBe('callbackRequested')
  })

  it('a sent booking link still wins over hasCallbackRequested', () => {
    expect(classifyCall(undefined, false, false, true, false, false, true).category).toBe('linked')
  })

  it('a review request still wins over hasCallbackRequested', () => {
    expect(classifyCall(undefined, false, false, false, false, true, true).category).toBe('reviewRequested')
  })

  it('a real booking still wins over hasCallbackRequested', () => {
    expect(classifyCall(undefined, true, false, false, false, false, true).category).toBe('booked')
  })
})
