import { describe, expect, it } from 'vitest'
import { compileSystemPrompt, type PromptSection, type StructuredDocumentData } from './promptSections'

const HOURS: StructuredDocumentData['hours'] = {
  mon: { open: true, opensAt: '09:00', closesAt: '17:00' },
  tue: { open: true, opensAt: '09:00', closesAt: '17:00' },
  wed: { open: true, opensAt: '09:00', closesAt: '17:00' },
  thu: { open: true, opensAt: '09:00', closesAt: '17:00' },
  fri: { open: true, opensAt: '09:00', closesAt: '17:00' },
  sat: { open: false, opensAt: '09:00', closesAt: '17:00' },
  sun: { open: false, opensAt: '09:00', closesAt: '17:00' },
}

const STRUCTURED: StructuredDocumentData = {
  hours: HOURS,
  services: [{ name: 'Haircut', durationMinutes: 30, priceCents: 4500 }],
  staff: [{ name: 'Amanda', active: true, hours: null }],
}

function section(overrides: Partial<PromptSection>): PromptSection {
  return {
    id: 'x', key: 'x', title: 'Untitled', headingLevel: 2, kind: 'text',
    content: null, draftContent: null, clientEditable: false, sortOrder: 0,
    ...overrides,
  }
}

describe('compileSystemPrompt', () => {
  it('renders sections in sortOrder, not array order, with correct heading depth', () => {
    const sections = [
      section({ key: 'b', title: 'Second', headingLevel: 2, content: 'body two', sortOrder: 1 }),
      section({ key: 'a', title: 'First', headingLevel: 1, content: 'body one', sortOrder: 0 }),
    ]
    const result = compileSystemPrompt(sections, STRUCTURED)
    expect(result).toBe('# First\n\nbody one\n\n## Second\n\nbody two')
  })

  it('renders a null text content as an empty body rather than throwing', () => {
    const sections = [section({ key: 'a', title: 'Empty', content: null, sortOrder: 0 })]
    expect(compileSystemPrompt(sections, STRUCTURED)).toBe('## Empty\n\n')
  })

  it('renders hours_table/services_table/staff_table from structured data, interleaved with text sections', () => {
    const sections = [
      section({ key: 'intro', title: 'Identity', content: 'You are Ellie.', sortOrder: 0 }),
      section({ key: 'hours', title: 'Hours', kind: 'hours_table', sortOrder: 1 }),
      section({ key: 'services', title: 'Services', kind: 'services_table', sortOrder: 2 }),
      section({ key: 'staff', title: 'Team', kind: 'staff_table', sortOrder: 3 }),
    ]
    const result = compileSystemPrompt(sections, STRUCTURED)
    expect(result).toContain('## Identity\n\nYou are Ellie.')
    expect(result).toContain('## Hours\n\nMon: 09:00')
    expect(result).toContain('## Services\n\n- Haircut (30 min) — $45.00')
    expect(result).toContain('## Team\n\n- Amanda —')
  })
})
