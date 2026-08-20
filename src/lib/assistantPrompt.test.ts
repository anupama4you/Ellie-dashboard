import { describe, expect, it } from 'vitest'
import { fmtCustomInstructions, patchPromptSections, buildAssistantConfig, sectionMarkers } from './assistantPrompt'

const ALL_OPEN = {
  mon: { open: true, opensAt: '09:00', closesAt: '17:00' },
  tue: { open: true, opensAt: '09:00', closesAt: '17:00' },
  wed: { open: true, opensAt: '09:00', closesAt: '17:00' },
  thu: { open: true, opensAt: '09:00', closesAt: '17:00' },
  fri: { open: true, opensAt: '09:00', closesAt: '17:00' },
  sat: { open: false, opensAt: '09:00', closesAt: '17:00' },
  sun: { open: false, opensAt: '09:00', closesAt: '17:00' },
}

describe('fmtCustomInstructions', () => {
  it('returns the trimmed instructions when present', () => {
    expect(fmtCustomInstructions('  Always mention the loyalty card.  ')).toBe('Always mention the loyalty card.')
  })

  it('falls back to a placeholder when empty', () => {
    expect(fmtCustomInstructions('')).toBe('(No additional instructions from the business owner.)')
    expect(fmtCustomInstructions('   ')).toBe('(No additional instructions from the business owner.)')
  })
})

describe('patchPromptSections — customInstructions', () => {
  it('patches content between existing customInstructions markers', () => {
    const m = sectionMarkers('customInstructions')
    const prompt = `Some intro.\n\n${m.open}\nold instructions\n${m.close}\n\nRest of prompt.`

    const { patched, appliedSections, missingSections } = patchPromptSections(prompt, {
      hours: ALL_OPEN,
      services: [],
      staff: [],
      faqs: [],
      transferRules: '',
      customInstructions: 'Mention the loyalty card at the end of every call.',
    })

    expect(appliedSections).toContain('customInstructions')
    expect(missingSections).not.toContain('customInstructions')
    expect(patched).toContain('Mention the loyalty card at the end of every call.')
    expect(patched).not.toContain('old instructions')
  })

  it('reports customInstructions as missing when no marker exists, without touching the prompt', () => {
    const prompt = 'Some prompt with no customInstructions marker at all.'

    const { patched, missingSections } = patchPromptSections(prompt, {
      hours: ALL_OPEN,
      services: [],
      staff: [],
      faqs: [],
      transferRules: '',
      customInstructions: 'This should not appear anywhere.',
    })

    expect(missingSections).toContain('customInstructions')
    expect(patched).toBe(prompt)
  })
})

describe('buildAssistantConfig — customInstructions', () => {
  it('includes the customInstructions marker and content in a freshly generated prompt', () => {
    const { systemPrompt } = buildAssistantConfig({
      businessName: 'Test Salon',
      greeting: '',
      customInstructions: 'Always offer a free consultation for new clients.',
      hours: ALL_OPEN,
      services: [],
      staff: [],
      faqs: [],
      transferRules: '',
      timezone: 'Australia/Adelaide',
    })

    const m = sectionMarkers('customInstructions')
    expect(systemPrompt).toContain(m.open)
    expect(systemPrompt).toContain(m.close)
    expect(systemPrompt).toContain('Always offer a free consultation for new clients.')
  })

  it('still includes the marker (with a placeholder) when no custom instructions were given, so it can be patched later', () => {
    const { systemPrompt } = buildAssistantConfig({
      businessName: 'Test Salon',
      greeting: '',
      hours: ALL_OPEN,
      services: [],
      staff: [],
      faqs: [],
      transferRules: '',
      timezone: 'Australia/Adelaide',
    })

    const m = sectionMarkers('customInstructions')
    expect(systemPrompt).toContain(m.open)
    expect(systemPrompt).toContain(m.close)
    expect(systemPrompt).toContain('(No additional instructions from the business owner.)')
  })
})
