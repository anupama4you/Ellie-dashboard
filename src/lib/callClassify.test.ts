import { describe, expect, it } from 'vitest'
import { categoryStyle } from './callClassify'

describe('categoryStyle', () => {
  it('returns the same label/colors classifyCall uses for a booked call', () => {
    expect(categoryStyle('booked')).toEqual({ label: 'Booked', color: 'var(--signal)', bg: 'var(--signal-soft)' })
  })

  it('returns the same label/colors classifyCall uses for a missed call', () => {
    expect(categoryStyle('missed')).toEqual({ label: 'No answer', color: 'var(--coral)', bg: 'var(--coral-soft)' })
  })

  it('falls back to a neutral style for an unrecognised category', () => {
    expect(categoryStyle('not-a-real-category')).toEqual({ label: 'not-a-real-category', color: 'var(--ink-3)', bg: 'var(--paper)' })
  })
})
