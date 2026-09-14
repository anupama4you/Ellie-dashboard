import { describe, expect, it } from 'vitest'
import { fmtCustomInstructions } from './assistantPrompt'

describe('fmtCustomInstructions', () => {
  it('returns the trimmed instructions when present', () => {
    expect(fmtCustomInstructions('  Always mention the loyalty card.  ')).toBe('Always mention the loyalty card.')
  })

  it('falls back to a placeholder when empty', () => {
    expect(fmtCustomInstructions('')).toBe('(No additional instructions from the business owner.)')
    expect(fmtCustomInstructions('   ')).toBe('(No additional instructions from the business owner.)')
  })
})
