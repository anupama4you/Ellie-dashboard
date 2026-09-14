import { describe, expect, it } from 'vitest'
import { compileSystemPrompt, splitPromptIntoSections, joinSections, normalizeWhitespace, type PromptSection, type StructuredDocumentData } from './promptSections'

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

describe('splitPromptIntoSections / joinSections round trip', () => {
  const SAMPLE = `# IDENTITY

You are Ellie, the AI receptionist for Test Salon.

## HOURS

Monday to Saturday, by appointment.

## LOCATIONS

TORRENSVILLE
144B Henley Beach Road

NEWTON
Shop 18, 3 Jan Street

### PARKING

Ask the clinic team to confirm.`

  it('splits on markdown headings and preserves depth/title/content', () => {
    const sections = splitPromptIntoSections(SAMPLE)
    expect(sections).toEqual([
      { title: 'IDENTITY', headingLevel: 1, content: 'You are Ellie, the AI receptionist for Test Salon.' },
      { title: 'HOURS', headingLevel: 2, content: 'Monday to Saturday, by appointment.' },
      { title: 'LOCATIONS', headingLevel: 2, content: 'TORRENSVILLE\n144B Henley Beach Road\n\nNEWTON\nShop 18, 3 Jan Street' },
      { title: 'PARKING', headingLevel: 3, content: 'Ask the clinic team to confirm.' },
    ])
  })

  it('round-trips through joinSections back to the (whitespace-normalized) original', () => {
    const rejoined = joinSections(splitPromptIntoSections(SAMPLE))
    expect(normalizeWhitespace(rejoined)).toBe(normalizeWhitespace(SAMPLE))
  })

  it('puts any text before the first heading into an "Introduction" section instead of dropping it', () => {
    const text = 'Some preamble with no heading.\n\n# First Real Heading\n\nbody'
    const sections = splitPromptIntoSections(text)
    expect(sections[0]).toEqual({ title: 'Introduction', headingLevel: 1, content: 'Some preamble with no heading.' })
    expect(sections[1].title).toBe('First Real Heading')
  })

  it('returns an empty array for a prompt with no headings at all (nothing to migrate structurally)', () => {
    expect(splitPromptIntoSections('')).toEqual([])
  })
})
