import { fmtHours, fmtServices, fmtStaff } from './assistantPrompt'

export type DayHours = { open: boolean; opensAt: string; closesAt: string }
export type Hours = Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', DayHours>
export type ServiceDraft = { id?: string; name: string; durationMinutes: number | null; priceCents: number | null }
export type StaffDraft = { id?: string; name: string; active: boolean; hours: Hours | null }

export type SectionKind = 'text' | 'hours_table' | 'services_table' | 'staff_table'

export type PromptSection = {
  id: string
  key: string
  title: string
  headingLevel: 1 | 2 | 3
  kind: SectionKind
  content: string | null
  draftContent: string | null
  clientEditable: boolean
  sortOrder: number
}

type SectionRow = {
  id: string
  key: string
  title: string
  heading_level: number
  kind: SectionKind
  content: string | null
  draft_content: string | null
  client_editable: boolean
  sort_order: number
}

export function mapSectionRow(row: SectionRow): PromptSection {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    headingLevel: row.heading_level as 1 | 2 | 3,
    kind: row.kind,
    content: row.content,
    draftContent: row.draft_content,
    clientEditable: row.client_editable,
    sortOrder: row.sort_order,
  }
}

export type StructuredDocumentData = {
  hours: Hours
  services: ServiceDraft[]
  staff: StaffDraft[]
}

function renderSectionBody(section: PromptSection, structured: StructuredDocumentData): string {
  switch (section.kind) {
    case 'text':           return section.content ?? ''
    case 'hours_table':    return fmtHours(structured.hours)
    case 'services_table': return fmtServices(structured.services)
    case 'staff_table':    return fmtStaff(structured.staff)
  }
}

/**
 * The entire Vapi system prompt is this function's output — no template,
 * no marker-hunting. Structured sections (hours/services/staff) render from
 * live business data; every other section renders its own stored prose
 * verbatim. Always operates on *live* content — callers promote pending
 * drafts to live before compiling (see applyPendingChanges).
 */
export function compileSystemPrompt(sections: PromptSection[], structured: StructuredDocumentData): string {
  return sections
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(s => `${'#'.repeat(s.headingLevel)} ${s.title}\n\n${renderSectionBody(s, structured)}`)
    .join('\n\n')
}

export type SplitSection = { title: string; headingLevel: 1 | 2 | 3; content: string }

const HEADING_RE = /^(#{1,3})\s+(.+)$/

/**
 * One-time migration helper: turns an existing hand-authored prompt into an
 * ordered section list by splitting on markdown headings. Text before the
 * first heading becomes an "Introduction" section rather than being
 * dropped. A heading-less, empty-preamble input yields no sections.
 */
export function splitPromptIntoSections(promptText: string): SplitSection[] {
  const lines = promptText.split('\n')
  const sections: SplitSection[] = []
  let current: SplitSection | null = null
  let preamble: string[] = []

  const flushPreamble = () => {
    const text = preamble.join('\n').trim()
    if (text) sections.push({ title: 'Introduction', headingLevel: 1, content: text })
    preamble = []
  }

  for (const line of lines) {
    const m = line.match(HEADING_RE)
    if (m) {
      if (current) sections.push({ ...current, content: current.content.trim() })
      else flushPreamble()
      current = { title: m[2].trim(), headingLevel: m[1].length as 1 | 2 | 3, content: '' }
    } else if (current) {
      current.content += (current.content ? '\n' : '') + line
    } else {
      preamble.push(line)
    }
  }
  if (current) sections.push({ ...current, content: current.content.trim() })
  else flushPreamble()

  return sections
}

export function joinSections(sections: SplitSection[]): string {
  return sections.map(s => `${'#'.repeat(s.headingLevel)} ${s.title}\n\n${s.content}`).join('\n\n')
}

/** Line-ending/blank-line noise normalized away — used to compare prompt text before/after a migration split without demanding byte-identical whitespace. */
export function normalizeWhitespace(text: string): string {
  return text
    .split('\n')
    .map(l => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
