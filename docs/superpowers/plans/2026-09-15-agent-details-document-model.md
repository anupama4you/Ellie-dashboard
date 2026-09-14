# Agent Details Document Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Briefing draft/live split + marker-based prompt patching with one ordered, per-business list of named sections (`prompt_sections`) whose concatenation *is* the Vapi system prompt — killing the double-entry between structured business fields and hand-authored prompt prose.

**Architecture:** A new `prompt_sections` table holds an ordered document per business. Three special section kinds (`hours_table`/`services_table`/`staff_table`) render from the existing structured tables (`businesses.hours`, `business_services`, `business_staff`) because the webhook's `checkAvailability`/`bookAppointment` tool-calls parse them programmatically; every other section (`kind: 'text'`) stores its prose directly on the row. Client edits stage as drafts (`draft_content` per text row; the existing `businesses.draft_briefing` jsonb for the three structured kinds plus `greetingScript`/`transferPhoneNumber`); one admin "Apply & Push" promotes every pending draft at once and recompiles + pushes the full prompt to Vapi.

**Tech Stack:** Next.js App Router, Supabase (Postgres + `@supabase/supabase-js`), Vapi REST API (`src/lib/vapi.ts`), Vitest for unit tests.

**Spec:** `docs/superpowers/specs/2026-09-15-agent-details-document-model-design.md`

## Global Constraints

- No LLM client or API is introduced anywhere in this feature — all section content is exactly what a human typed (spec Non-goals).
- `src/app/api/vapi-webhook/route.ts` (`checkAvailability`/`bookAppointment`/transfer-call handling) must not change — it keeps reading `businesses.hours`/`business_services`/`business_staff`/`businesses.transfer_phone_number` directly, unchanged in shape.
- Admin approval is whole-document only — no per-section approve/reject (spec Non-goals, confirmed in brainstorming).
- A new section's starting text may be seeded **once**, at creation time, from operational columns — never re-synced afterward (spec Non-goals).
- Schema changes are small, single-purpose files under `supabase/migrations/`, following the existing timestamped convention.
- AU-only formatting/locale conventions apply to any new user-facing copy (per `AGENTS.md`/`PROJECT_CONTEXT.md`).
- `transfer_phone_number` stays structured (not a prose section) — `src/app/api/vapi-webhook/route.ts:440-451` dials it directly for the native `transferCall` tool, and `src/app/(dashboard)/actions.ts`/`Sidebar.tsx` read it live for the "pause line, forward calls" safety feature. Only `transfer_rules` (the free-text *when-to-transfer* guidance) becomes a prose section.

## File Structure

**New:**
- `supabase/migrations/20260915000000_prompt_sections.sql` — the `prompt_sections` table.
- `src/lib/promptSections.ts` — types, `compileSystemPrompt()`, `splitPromptIntoSections()`, `normalizeWhitespace()` (pure, unit-tested).
- `src/lib/promptSections.test.ts`
- `src/app/(dashboard)/agent-details/page.tsx`, `actions.ts`, `loading.tsx` — replaces `src/app/(dashboard)/briefing/`.
- `src/components/AgentDetailsEditor.tsx` — client-facing document editor.
- `src/components/sections/TextSectionField.tsx`, `HoursSectionField.tsx`, `ServicesSectionField.tsx`, `StaffSectionField.tsx` — reusable per-kind field widgets, shared by client and admin editors.
- `src/components/AdminDocumentEditor.tsx` — admin-facing document editor (section CRUD + diff review + Apply & Push), replaces `SystemPromptEditor.tsx`.
- `scripts/migrate-existing-prompts-to-sections.mjs` — one-off migration for the two live businesses.

**Modified:**
- `src/lib/assistantPrompt.ts` — drop `buildAssistantConfig`/`patchPromptSections`/`sectionMarkers`/`BriefingSectionKey`/`BriefingSectionData`/`SECTION_KEYS`/`INLINE_SECTIONS`/`sectionContent`; keep `fmtHours`/`fmtServices`/`fmtFaqs`/`fmtStaff`/`fmtTransferRules`/`fmtCustomInstructions`/`defaultGreeting`.
- `src/lib/assistantPrompt.test.ts` — drop tests for removed functions.
- `src/lib/briefing.ts` — trims to the structured-only fields (`hours`, `services`, `staff`, `greetingScript`, `transferPhoneNumber`).
- `src/app/admin/clients/[id]/prompt/actions.ts` — rewritten: section CRUD + direct-edit + `applyPendingChanges`.
- `src/app/admin/clients/[id]/prompt/page.tsx` — fetches `prompt_sections`, renders `AdminDocumentEditor`.
- `src/app/admin/clients/new/page.tsx` — seeds starter sections after the business insert.
- `src/components/AdminClientHeader.tsx` — drops the "Company Information" tab; renames "System Prompt" tab to "Agent Details".
- `src/components/Sidebar.tsx` — nav entry `/briefing` "Business" → `/agent-details` "Agent Details".
- `src/app/admin/clients/page.tsx` — any `/briefing` link → `/agent-details`-equivalent admin route (the admin Prompt tab).
- `PROJECT_CONTEXT.md` — replaces "The Briefing draft/live split" section with the new model.

**Deleted (Task 12):**
- `src/app/(dashboard)/briefing/` (page.tsx, actions.ts, loading.tsx)
- `src/app/admin/clients/[id]/briefing/` (page.tsx, actions.ts, loading.tsx)
- `src/components/BriefingEditor.tsx`, `BriefingReadOnly.tsx`, `AdminCompanyInfoEditor.tsx`, `SystemPromptEditor.tsx`

---

### Task 1: `prompt_sections` table

**Files:**
- Create: `supabase/migrations/20260915000000_prompt_sections.sql`

**Interfaces:**
- Produces: the `prompt_sections` table every later task reads/writes.

- [ ] **Step 1: Write the migration**

```sql
create table if not exists public.prompt_sections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  key text not null,
  title text not null,
  heading_level smallint not null default 2 check (heading_level between 1 and 3),
  kind text not null default 'text'
    check (kind in ('text', 'hours_table', 'services_table', 'staff_table')),
  content text,
  draft_content text,
  client_editable boolean not null default false,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  unique (business_id, key)
);

-- At most one of each structured kind per business — compileSystemPrompt
-- would silently render the same table twice otherwise.
create unique index if not exists prompt_sections_one_structured_kind_per_business
  on public.prompt_sections (business_id, kind)
  where kind != 'text';

create index if not exists prompt_sections_business_sort_idx
  on public.prompt_sections (business_id, sort_order);

alter table public.prompt_sections enable row level security;

-- Clients read/write only their own business's sections, and only rows
-- marked client_editable (mutation restricted to draft_content — enforced
-- in application code in later tasks, since column-level RLS on a single
-- UPDATE statement would block updating other columns like sort_order that
-- clients never touch anyway; the admin-only columns are simply never sent
-- from the client action).
create policy "clients can read their own business's sections"
  on public.prompt_sections for select
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "clients can update draft_content on their own editable sections"
  on public.prompt_sections for update
  using (
    client_editable = true
    and business_id in (select id from public.businesses where user_id = auth.uid())
  );
```

- [ ] **Step 2: Apply the migration to local dev Supabase**

Run: `supabase migration up` (from repo root, local Supabase running — see the "Local Supabase dev setup" reference doc for first-time setup gotchas).

- [ ] **Step 3: Verify the table shape**

Run: `supabase db execute "select column_name, data_type from information_schema.columns where table_name = 'prompt_sections' order by ordinal_position;"`
Expected: the 11 columns above, in order.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260915000000_prompt_sections.sql
git commit -m "$(cat <<'EOF'
Add prompt_sections table for the Agent Details document model

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Section types + `compileSystemPrompt()`

**Files:**
- Create: `src/lib/promptSections.ts`
- Create: `src/lib/promptSections.test.ts`
- Modify: `src/lib/assistantPrompt.ts` (remove marker/template machinery, keep formatters)
- Modify: `src/lib/assistantPrompt.test.ts` (remove tests for removed functions)

**Interfaces:**
- Consumes: `fmtHours`, `fmtServices`, `fmtStaff` from `./assistantPrompt` (unchanged signatures).
- Produces: `PromptSection`, `SectionKind`, `Hours`, `DayHours`, `ServiceDraft`, `StaffDraft`, `StructuredDocumentData` types; `mapSectionRow()`, `compileSystemPrompt()` — every later task (data layer, both editors, migration script) imports these from `@/lib/promptSections`.

- [ ] **Step 1: Write the failing test for `compileSystemPrompt`**

```ts
// src/lib/promptSections.test.ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/promptSections.test.ts`
Expected: FAIL — `Cannot find module './promptSections'`

- [ ] **Step 3: Trim `src/lib/assistantPrompt.ts` to formatters only**

Delete everything from the `BriefingSectionKey` type (current line 93) through the end of `patchPromptSections` (current line 159), and delete `buildAssistantConfig` (current lines 161–257) entirely. The file should end with `defaultGreeting` (keep lines 1–83 as-is: `fmtHours`, `fmtServices`, `fmtFaqs`, `fmtStaff`, `fmtTransferRules`, `fmtCustomInstructions`, `fmtDescription`, `fmtLocation`, `fmtWebsite`, `defaultGreeting`, and their shared types `ServiceInput`/`FaqInput`/`StaffInput`/`CompanyInfoInput`).

Also change line 1's import — it currently reads `Hours` from `@/app/(dashboard)/briefing/actions`; change it to import from the new `@/lib/promptSections` (defined in Step 4 below), since that becomes the canonical home for `Hours`:

```ts
import type { Hours } from '@/lib/promptSections'
```

- [ ] **Step 4: Write `src/lib/promptSections.ts`**

```ts
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/promptSections.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Remove the now-dead tests from `src/lib/assistantPrompt.test.ts`**

Delete the `describe('patchPromptSections — customInstructions', ...)` and `describe('buildAssistantConfig — customInstructions', ...)` blocks (current lines 25–99). Keep the `describe('fmtCustomInstructions', ...)` block (lines 14–23) and update its import line to drop the now-removed names:

```ts
import { describe, expect, it } from 'vitest'
import { fmtCustomInstructions } from './assistantPrompt'
```

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run src/lib/assistantPrompt.test.ts src/lib/promptSections.test.ts`
Expected: PASS, no failures. Note: `src/components/SystemPromptEditor.tsx` now has a broken import (`buildAssistantConfig`/`patchPromptSections` no longer exported) — this is expected and does not fail `npm test` (vitest only runs `.test.ts` files, and this component has none); it's fixed by Task 9 replacing this component's usage entirely. Don't attempt to fix `SystemPromptEditor.tsx` in this task.

- [ ] **Step 8: Commit**

```bash
git add src/lib/promptSections.ts src/lib/promptSections.test.ts src/lib/assistantPrompt.ts src/lib/assistantPrompt.test.ts
git commit -m "$(cat <<'EOF'
Replace buildAssistantConfig/patchPromptSections with compileSystemPrompt

The Vapi system prompt is now the concatenation of a business's ordered
prompt_sections rows, not a hardcoded template patched via HTML-comment
markers. Formatters (fmtHours etc.) are unchanged and reused.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Migration-split helper (for existing hand-authored prompts)

**Files:**
- Modify: `src/lib/promptSections.ts` (add `splitPromptIntoSections`, `joinSections`, `normalizeWhitespace`)
- Modify: `src/lib/promptSections.test.ts`

**Interfaces:**
- Produces: `SplitSection`, `splitPromptIntoSections()`, `joinSections()`, `normalizeWhitespace()` — consumed by Task 11's migration script.

- [ ] **Step 1: Write the failing tests**

```ts
// append to src/lib/promptSections.test.ts
import { splitPromptIntoSections, joinSections, normalizeWhitespace } from './promptSections'

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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/promptSections.test.ts`
Expected: FAIL — `splitPromptIntoSections is not a function`

- [ ] **Step 3: Implement**

```ts
// append to src/lib/promptSections.ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/promptSections.test.ts`
Expected: PASS (7 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/lib/promptSections.ts src/lib/promptSections.test.ts
git commit -m "$(cat <<'EOF'
Add splitPromptIntoSections for one-time migration of hand-authored prompts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Trim `src/lib/briefing.ts` to structured-only fields

**Files:**
- Modify: `src/lib/briefing.ts`

**Interfaces:**
- Consumes: `Hours`, `ServiceDraft`, `StaffDraft` from `@/lib/promptSections` (Task 2).
- Produces: `StructuredDraft` type, `liveStructuredData()`, `resolveStructuredData()` — consumed by Task 5 (admin apply) and Task 6 (client save/load).

`business_faqs`, company info columns, and `transfer_rules` (the free-text guidance) stop flowing through this file — they become plain `prompt_sections` rows, authored/edited directly where sections are edited (Tasks 6/9), with no formatting layer. `greeting_script` and `transfer_phone_number` stay here alongside hours/services/staff, since (per Global Constraints) `transfer_phone_number` is operationally structured, not prose, and `greeting_script` is `assistant.firstMessage` — a distinct Vapi field, not part of the compiled system prompt.

- [ ] **Step 1: Rewrite the file**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Hours, ServiceDraft, StaffDraft } from '@/lib/promptSections'

export type StructuredDraft = {
  greetingScript: string
  hours: Hours
  transferPhoneNumber: string
  services: ServiceDraft[]
  staff: StaffDraft[]
}

/**
 * Client's Agent Details save path for the three structured pieces
 * (hours/services/staff) plus greeting/transfer number. Stages the
 * submitted fields in `draft_briefing` only — never touches the live
 * businesses/business_services columns the call-handling webhook reads.
 * Prose section edits are staged separately, directly on their
 * prompt_sections rows (see agent-details/actions.ts) — both are flagged
 * for admin review via the same briefing_needs_review/briefing_updated_at
 * pair so one Apply & Push promotes everything at once.
 */
export async function saveStructuredDraft(supabase: SupabaseClient, businessId: string, payload: StructuredDraft) {
  const { error } = await supabase
    .from('businesses')
    .update({
      draft_briefing: payload,
      briefing_needs_review: true,
      briefing_updated_at: new Date().toISOString(),
    })
    .eq('id', businessId)
  if (error) throw new Error(error.message)
}

type BizStructuredRow = {
  greeting_script: string | null
  hours: unknown
  transfer_phone_number: string | null
  draft_briefing: unknown
}

type LiveServiceRow = { id: string; name: string; duration_minutes: number | null; price_cents: number | null }
type LiveStaffRow = { id: string; name: string; active: boolean; hours: unknown }

/** Always the *live* values, ignoring any pending draft — used as the diff baseline. */
export function liveStructuredData(
  biz: BizStructuredRow, liveServices: LiveServiceRow[], liveStaff: LiveStaffRow[],
): StructuredDraft {
  return {
    greetingScript: biz.greeting_script ?? '',
    hours: biz.hours as Hours,
    transferPhoneNumber: biz.transfer_phone_number ?? '',
    services: liveServices.map(s => ({ id: s.id, name: s.name, durationMinutes: s.duration_minutes, priceCents: s.price_cents })),
    staff: liveStaff.map(s => ({ id: s.id, name: s.name, active: s.active, hours: s.hours as Hours | null })),
  }
}

/** Draft-preferred: returns the pending client draft if one exists, else falls back to live values. */
export function resolveStructuredData(
  biz: BizStructuredRow, liveServices: LiveServiceRow[], liveStaff: LiveStaffRow[],
): StructuredDraft & { isDraft: boolean } {
  if (biz.draft_briefing) {
    const draft = biz.draft_briefing as StructuredDraft
    return { ...draft, staff: draft.staff ?? [], services: draft.services ?? [], isDraft: true }
  }
  return { ...liveStructuredData(biz, liveServices, liveStaff), isDraft: false }
}
```

- [ ] **Step 2: Search for now-broken importers**

Run: `grep -rn "from '@/lib/briefing'" src/ | grep -v ".test.ts"`
Expected output at this point: `src/app/(dashboard)/briefing/actions.ts` and `src/app/admin/clients/[id]/briefing/page.tsx` and `src/app/admin/clients/[id]/briefing/actions.ts` and `src/app/admin/clients/[id]/prompt/actions.ts` and `src/app/admin/clients/[id]/prompt/page.tsx` still reference the old `saveDraftBriefing`/`liveBriefing`/`resolveBriefing`/`BriefingPayload` names — expected and fine, every one of those files is rewritten or deleted in Tasks 5, 6, 9, and 12. Do not fix them in this task.

- [ ] **Step 3: Commit**

```bash
git add src/lib/briefing.ts
git commit -m "$(cat <<'EOF'
Trim briefing.ts to the three structured fields the webhook still reads

FAQs, company info, and transfer-rules prose move to prompt_sections rows
in the next tasks — this file now only stages/resolves hours, services,
staff, greeting, and the transfer phone number.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Admin section-management + apply actions

**Files:**
- Modify: `src/app/admin/clients/[id]/prompt/actions.ts` (full rewrite)

**Interfaces:**
- Consumes: `saveStructuredDraft`/`liveStructuredData`/`resolveStructuredData`/`StructuredDraft` (Task 4), `compileSystemPrompt`/`mapSectionRow`/`PromptSection` (Task 2), `syncAssistantPrompt` (existing, unchanged).
- Produces: `addSection`, `removeSection`, `reorderSections`, `setSectionEditable`, `saveSectionDirect`, `applyPendingChanges` — consumed by `AdminDocumentEditor` (Task 9).

- [ ] **Step 1: Write the file**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncAssistantPrompt } from '@/lib/vapi'
import { assertAdmin } from '@/lib/adminAuth'
import { compileSystemPrompt, mapSectionRow, type SectionKind, type PromptSection } from '@/lib/promptSections'
import type { StructuredDraft } from '@/lib/briefing'

async function loadCompiledPrompt(admin: ReturnType<typeof createAdminClient>, businessId: string) {
  const [{ data: biz }, { data: sectionRows }, { data: services }, { data: staff }] = await Promise.all([
    admin.from('businesses').select('hours').eq('id', businessId).single(),
    admin.from('prompt_sections').select('*').eq('business_id', businessId).order('sort_order'),
    admin.from('business_services').select('*').eq('business_id', businessId).order('sort_order'),
    admin.from('business_staff').select('*').eq('business_id', businessId).order('sort_order'),
  ])
  const sections = (sectionRows ?? []).map(mapSectionRow)
  return compileSystemPrompt(sections, {
    hours: biz?.hours,
    services: (services ?? []).map(s => ({ name: s.name, durationMinutes: s.duration_minutes, priceCents: s.price_cents })),
    staff: (staff ?? []).map(s => ({ name: s.name, active: s.active, hours: s.hours })),
  })
}

/** Admin authoring a section's live content directly — no draft cycle, no client submission involved. Recompiles and pushes immediately. */
export async function saveSectionDirect(businessId: string, sectionId: string, content: string): Promise<void> {
  await assertAdmin()
  const admin = createAdminClient()

  const { error } = await admin.from('prompt_sections').update({ content }).eq('id', sectionId).eq('business_id', businessId)
  if (error) throw new Error(error.message)

  const { data: biz } = await admin.from('businesses').select('vapi_assistant_id, greeting_script, name').eq('id', businessId).single()
  if (!biz?.vapi_assistant_id) throw new Error('No Vapi assistant connected to this business')

  const systemPrompt = await loadCompiledPrompt(admin, businessId)
  await syncAssistantPrompt(biz.vapi_assistant_id, { firstMessage: biz.greeting_script || `Thanks for calling ${biz.name}, this is Ellie. How can I help you today?`, systemPrompt })

  revalidatePath(`/admin/clients/${businessId}/prompt`)
}

export async function addSection(businessId: string, input: { title: string; headingLevel: 1 | 2 | 3; kind: SectionKind; clientEditable: boolean }): Promise<void> {
  await assertAdmin()
  const admin = createAdminClient()

  const { data: existing } = await admin.from('prompt_sections').select('sort_order').eq('business_id', businessId).order('sort_order', { ascending: false }).limit(1)
  const nextSortOrder = (existing?.[0]?.sort_order ?? -1) + 1
  const key = `${input.kind}_${Date.now()}`

  const { error } = await admin.from('prompt_sections').insert({
    business_id: businessId,
    key,
    title: input.title,
    heading_level: input.headingLevel,
    kind: input.kind,
    content: input.kind === 'text' ? '' : null,
    client_editable: input.clientEditable,
    sort_order: nextSortOrder,
  })
  if (error) throw new Error(error.message)

  revalidatePath(`/admin/clients/${businessId}/prompt`)
}

export async function removeSection(businessId: string, sectionId: string): Promise<void> {
  await assertAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('prompt_sections').delete().eq('id', sectionId).eq('business_id', businessId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/clients/${businessId}/prompt`)
}

/** Persists a full reordered id list as the new sort_order sequence. */
export async function reorderSections(businessId: string, orderedIds: string[]): Promise<void> {
  await assertAdmin()
  const admin = createAdminClient()
  for (const [i, id] of orderedIds.entries()) {
    const { error } = await admin.from('prompt_sections').update({ sort_order: i }).eq('id', id).eq('business_id', businessId)
    if (error) throw new Error(error.message)
  }
  revalidatePath(`/admin/clients/${businessId}/prompt`)
}

export async function setSectionEditable(businessId: string, sectionId: string, clientEditable: boolean): Promise<void> {
  await assertAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('prompt_sections').update({ client_editable: clientEditable }).eq('id', sectionId).eq('business_id', businessId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/clients/${businessId}/prompt`)
}

/**
 * Promotes every pending draft (text sections' draft_content, plus the
 * structured draft_briefing blob) to live, diff-syncing staff by id and
 * delete/reinserting services exactly as the old applyDraftAndPushPrompt
 * did (appointments.staff_id FKs into business_staff, so staff can't be
 * delete-all-reinserted). Then recompiles the whole document and pushes to
 * Vapi. DB writes happen before the Vapi push; on Vapi failure the pending
 * flag is deliberately left set rather than rolled back.
 */
export async function applyPendingChanges(businessId: string, expectedBriefingUpdatedAt: string | null): Promise<void> {
  await assertAdmin()
  const admin = createAdminClient()

  const { data: biz } = await admin
    .from('businesses')
    .select('vapi_assistant_id, draft_briefing, briefing_updated_at, name')
    .eq('id', businessId)
    .single()

  if (!biz?.vapi_assistant_id) throw new Error('No Vapi assistant connected to this business')
  if (biz.briefing_updated_at !== expectedBriefingUpdatedAt) {
    throw new Error('The client has submitted newer changes since this page loaded — refresh and review before applying.')
  }

  const draft = biz.draft_briefing as StructuredDraft | null

  if (draft) {
    const { error: bizError } = await admin.from('businesses').update({
      greeting_script: draft.greetingScript,
      hours: draft.hours,
      transfer_phone_number: draft.transferPhoneNumber || null,
    }).eq('id', businessId)
    if (bizError) throw new Error(bizError.message)

    const { data: liveStaffRows } = await admin.from('business_staff').select('id').eq('business_id', businessId)
    const liveStaffIds = new Set((liveStaffRows ?? []).map(r => r.id))
    const draftStaffIds = new Set((draft.staff ?? []).filter(s => s.id).map(s => s.id!))

    const removedStaffIds = [...liveStaffIds].filter(id => !draftStaffIds.has(id))
    if (removedStaffIds.length > 0) {
      const { error } = await admin.from('business_staff').delete().in('id', removedStaffIds)
      if (error) throw new Error(error.message)
    }
    for (const [i, s] of (draft.staff ?? []).entries()) {
      if (s.id && liveStaffIds.has(s.id)) {
        const { error } = await admin.from('business_staff').update({ name: s.name, active: s.active, hours: s.hours, sort_order: i }).eq('id', s.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await admin.from('business_staff').insert({ business_id: businessId, name: s.name, active: s.active, hours: s.hours, sort_order: i })
        if (error) throw new Error(error.message)
      }
    }

    const { error: delServicesError } = await admin.from('business_services').delete().eq('business_id', businessId)
    if (delServicesError) throw new Error(delServicesError.message)
    if (draft.services.length > 0) {
      const { error } = await admin.from('business_services').insert(
        draft.services.map((s, i) => ({ business_id: businessId, name: s.name, duration_minutes: s.durationMinutes, price_cents: s.priceCents, sort_order: i }))
      )
      if (error) throw new Error(error.message)
    }
  }

  const { data: pendingSections } = await admin.from('prompt_sections').select('id, draft_content').eq('business_id', businessId).not('draft_content', 'is', null)
  for (const s of pendingSections ?? []) {
    const { error } = await admin.from('prompt_sections').update({ content: s.draft_content, draft_content: null }).eq('id', s.id)
    if (error) throw new Error(error.message)
  }

  const systemPrompt = await loadCompiledPrompt(admin, businessId)
  const { data: freshBiz } = await admin.from('businesses').select('greeting_script, name').eq('id', businessId).single()
  await syncAssistantPrompt(biz.vapi_assistant_id, {
    firstMessage: freshBiz?.greeting_script || `Thanks for calling ${freshBiz?.name ?? biz.name}, this is Ellie. How can I help you today?`,
    systemPrompt,
  })

  await admin.from('businesses').update({ draft_briefing: null, briefing_needs_review: false }).eq('id', businessId)

  revalidatePath(`/admin/clients/${businessId}/prompt`)
  revalidatePath('/admin/clients')
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors from this file (other files still referencing deleted/renamed names are expected to still error until later tasks land — confirm the error list only mentions files not yet touched: `src/app/(dashboard)/briefing/*` and `src/app/admin/clients/[id]/briefing/*` (fixed by Task 12's deletion), `src/app/admin/clients/[id]/prompt/page.tsx` (fixed by Task 9 — it still imports the old `adminSaveSystemPrompt`/`applyDraftAndPushPrompt` this task just removed), and `src/components/SystemPromptEditor.tsx` (already broken since Task 2 for unrelated reasons, now also missing `adminSaveSystemPrompt`/`applyDraftAndPushPrompt`; fixed by Task 9 dropping its usage entirely — do not fix this component itself in this task).

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/clients/\[id\]/prompt/actions.ts
git commit -m "$(cat <<'EOF'
Rewrite admin prompt actions around section CRUD + applyPendingChanges

Replaces adminSaveSystemPrompt/applyDraftAndPushPrompt's whole-prompt-text
model with per-section add/remove/reorder/toggle-editable plus one
whole-document apply that promotes every pending draft and recompiles.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Client Agent Details page + save action

**Files:**
- Create: `src/app/(dashboard)/agent-details/actions.ts`
- Create: `src/app/(dashboard)/agent-details/page.tsx`
- Create: `src/app/(dashboard)/agent-details/loading.tsx`

**Interfaces:**
- Consumes: `resolveStructuredData`, `saveStructuredDraft`, `StructuredDraft` (Task 4); `mapSectionRow`, `PromptSection` (Task 2); `getCurrentBusiness` (existing, unchanged); `isFeatureEnabled` (existing, unchanged).
- Produces: `saveAgentDetails(businessId, payload)` and the resolved-section shape `AgentDetailsData` — consumed by `AgentDetailsEditor` (Task 8).

- [ ] **Step 1: Write `actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { saveStructuredDraft, type StructuredDraft } from '@/lib/briefing'

export type SectionEdit = { id: string; content: string }

export type AgentDetailsSavePayload = {
  structured: StructuredDraft
  sectionEdits: SectionEdit[]
}

/**
 * Client's Agent Details save path. Stages structured fields in
 * draft_briefing (same mechanism as before) and, separately, writes
 * draft_content on each edited text section — guarded to client_editable
 * rows only, so a tampered request can't stage an edit to an admin-only
 * section. Both are covered by the same briefing_needs_review flag.
 */
export async function saveAgentDetails(businessId: string, payload: AgentDetailsSavePayload): Promise<void> {
  const supabase = await createClient()

  await saveStructuredDraft(supabase, businessId, payload.structured)

  for (const edit of payload.sectionEdits) {
    const { error } = await supabase
      .from('prompt_sections')
      .update({ draft_content: edit.content })
      .eq('id', edit.id)
      .eq('business_id', businessId)
      .eq('client_editable', true)
    if (error) throw new Error(error.message)
  }

  revalidatePath('/agent-details')
  revalidatePath(`/admin/clients/${businessId}/prompt`)
  revalidatePath('/admin/clients')
}
```

- [ ] **Step 2: Write `page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { resolveStructuredData } from '@/lib/briefing'
import { mapSectionRow } from '@/lib/promptSections'
import { isFeatureEnabled } from '@/lib/dashboardFeatures'
import AgentDetailsEditor from '@/components/AgentDetailsEditor'

export default async function AgentDetailsPage() {
  const { business: biz } = await getCurrentBusiness()
  const supabase = await createClient()

  if (!biz) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-3 sm:p-6 max-w-[1220px] mx-auto">
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>No business profile found.</p>
        </div>
      </div>
    )
  }

  const [{ data: services }, { data: staff }, { data: sectionRows }] = await Promise.all([
    supabase.from('business_services').select('*').eq('business_id', biz.id).order('sort_order'),
    supabase.from('business_staff').select('*').eq('business_id', biz.id).order('sort_order'),
    supabase.from('prompt_sections').select('*').eq('business_id', biz.id).eq('client_editable', true).order('sort_order'),
  ])

  const structured = resolveStructuredData(biz, services ?? [], staff ?? [])
  const showStaff = isFeatureEnabled(biz, 'staff')
  const sections = (sectionRows ?? [])
    .map(mapSectionRow)
    .filter(s => showStaff || s.kind !== 'staff_table')

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 sm:p-6 max-w-[1220px] mx-auto">
        <AgentDetailsEditor
          businessId={biz.id}
          businessName={biz.name}
          initialStructured={structured}
          isPendingReview={structured.isDraft}
          sections={sections}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write `loading.tsx`**

```tsx
export default function Loading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 sm:p-6 max-w-[1220px] mx-auto animate-pulse">
        <div className="h-8 w-48 rounded-lg mb-6" style={{ background: 'var(--bg3)' }} />
        <div className="h-40 rounded-2xl" style={{ background: 'var(--bg3)' }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Type-check (component doesn't exist yet — expected error)**

Run: `npx tsc --noEmit 2>&1 | grep agent-details`
Expected: one error, `Cannot find module '@/components/AgentDetailsEditor'` — resolved in Task 8.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/agent-details
git commit -m "$(cat <<'EOF'
Add Agent Details page and save action (client-facing document editor)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Reusable per-kind field widgets

**Files:**
- Create: `src/components/sections/TextSectionField.tsx`
- Create: `src/components/sections/HoursSectionField.tsx`
- Create: `src/components/sections/ServicesSectionField.tsx`
- Create: `src/components/sections/StaffSectionField.tsx`

**Interfaces:**
- Produces: four field components, each `{title, value, onChange}`-shaped (plus kind-specific extras), consumed by both `AgentDetailsEditor` (Task 8) and `AdminDocumentEditor` (Task 9) — one implementation shared by both editors.

- [ ] **Step 1: `TextSectionField.tsx`**

```tsx
'use client'

type Props = {
  title: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
}

/** Plain title + textarea — what the client types is exactly what ends up in the compiled prompt, verbatim, no reformatting. */
export default function TextSectionField({ title, value, onChange, placeholder }: Props) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
      <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--b3)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
      </div>
      <div className="p-5">
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? 'Write exactly what you want Ellie to know or say here…'}
          rows={6}
          className="w-full rounded-xl px-3.5 py-2.5 text-sm resize-y"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `HoursSectionField.tsx`** (extracted from `BriefingEditor.tsx`'s inline `HoursGrid`, unchanged behavior)

```tsx
'use client'

import type { Hours } from '@/lib/promptSections'

const DAY_LABELS: { key: keyof Hours; label: string }[] = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' },
]

type Props = { title?: string; hours: Hours; onChange: (next: Hours) => void }

export default function HoursSectionField({ title = 'Hours', hours, onChange }: Props) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
      <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--b3)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
      </div>
      {DAY_LABELS.map(({ key, label }, i) => {
        const d = hours[key]
        return (
          <div key={key} className="flex items-center gap-3 px-5 py-2.5" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
            <b className="w-10 text-sm font-semibold" style={{ color: 'var(--t2)' }}>{label}</b>
            {d.open ? (
              <div className="flex items-center gap-1.5 flex-1 font-mono text-sm" style={{ color: 'var(--text)' }}>
                <input type="time" value={d.opensAt}
                  onChange={e => onChange({ ...hours, [key]: { ...hours[key], opensAt: e.target.value } })}
                  className="rounded-lg px-1.5 py-1" style={{ border: '1px solid var(--border)' }} />
                <span style={{ color: 'var(--t3)' }}>–</span>
                <input type="time" value={d.closesAt}
                  onChange={e => onChange({ ...hours, [key]: { ...hours[key], closesAt: e.target.value } })}
                  className="rounded-lg px-1.5 py-1" style={{ border: '1px solid var(--border)' }} />
              </div>
            ) : (
              <span className="flex-1 text-sm italic" style={{ color: 'var(--t3)' }}>Closed</span>
            )}
            <button
              onClick={() => onChange({ ...hours, [key]: { ...hours[key], open: !hours[key].open } })}
              role="switch" aria-checked={d.open}
              className="w-[38px] h-[22px] rounded-full relative shrink-0"
              style={{ background: d.open ? 'var(--signal)' : 'var(--border)' }}
            >
              <span className="absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all" style={{ left: d.open ? 19 : 3 }} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: `ServicesSectionField.tsx`** (extracted service-row editor, same dollar-string-input approach as the old `BriefingEditor`)

```tsx
'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { ServiceDraft } from '@/lib/promptSections'

type ServiceRow = { id?: string; name: string; durationMinutes: number | null; price: string }
const PRICE_INPUT_RE = /^\d*\.?\d{0,2}$/

function toServiceRow(s: ServiceDraft): ServiceRow {
  return { id: s.id, name: s.name, durationMinutes: s.durationMinutes, price: s.priceCents != null ? (s.priceCents / 100).toFixed(2) : '' }
}
function toServiceDraft(r: ServiceRow): ServiceDraft {
  const n = parseFloat(r.price)
  return { id: r.id, name: r.name, durationMinutes: r.durationMinutes, priceCents: isNaN(n) ? null : Math.round(n * 100) }
}

type Props = { title?: string; services: ServiceDraft[]; onChange: (next: ServiceDraft[]) => void }

export default function ServicesSectionField({ title = 'Services', services, onChange }: Props) {
  const [rows, setRows] = useState<ServiceRow[]>(services.map(toServiceRow))

  function update(next: ServiceRow[]) {
    setRows(next)
    onChange(next.map(toServiceDraft))
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--b3)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
        <button
          onClick={() => update([...rows, { name: '', durationMinutes: 30, price: '' }])}
          className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--violet)' }}>
          <Plus size={13} /> Add service
        </button>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 px-5 py-2.5" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
          <input value={r.name} onChange={e => update(rows.map((row, j) => j === i ? { ...row, name: e.target.value } : row))}
            placeholder="Service name" className="flex-1 rounded-lg px-2.5 py-1.5 text-sm" style={{ border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)' }} />
          <input type="number" value={r.durationMinutes ?? ''} onChange={e => update(rows.map((row, j) => j === i ? { ...row, durationMinutes: e.target.value ? Number(e.target.value) : null } : row))}
            placeholder="Min" className="w-16 rounded-lg px-2 py-1.5 text-sm" style={{ border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)' }} />
          <input value={r.price} onChange={e => { if (PRICE_INPUT_RE.test(e.target.value)) update(rows.map((row, j) => j === i ? { ...row, price: e.target.value } : row)) }}
            placeholder="0.00" className="w-20 rounded-lg px-2 py-1.5 text-sm" style={{ border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)' }} />
          <button onClick={() => update(rows.filter((_, j) => j !== i))} style={{ color: 'var(--coral)' }}><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: `StaffSectionField.tsx`** (extracted staff-row editor, reuses `HoursSectionField` for each member's optional custom hours)

```tsx
'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Hours, StaffDraft } from '@/lib/promptSections'
import HoursSectionField from './HoursSectionField'

type Props = { title?: string; staff: StaffDraft[]; businessHours: Hours; onChange: (next: StaffDraft[]) => void }

export default function StaffSectionField({ title = 'Team', staff, businessHours, onChange }: Props) {
  const [rows, setRows] = useState<StaffDraft[]>(staff)

  function update(next: StaffDraft[]) {
    setRows(next)
    onChange(next)
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--b3)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
        <button onClick={() => update([...rows, { name: '', active: true, hours: null }])}
          className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--violet)' }}>
          <Plus size={13} /> Add team member
        </button>
      </div>
      {rows.map((s, i) => (
        <div key={i} className="flex flex-col gap-2 px-5 py-3" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
          <div className="flex items-center gap-2">
            <input value={s.name} onChange={e => update(rows.map((row, j) => j === i ? { ...row, name: e.target.value } : row))}
              placeholder="Name" className="flex-1 rounded-lg px-2.5 py-1.5 text-sm" style={{ border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)' }} />
            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--t3)' }}>
              <input type="checkbox" checked={s.active} onChange={e => update(rows.map((row, j) => j === i ? { ...row, active: e.target.checked } : row))} />
              Active
            </label>
            <button onClick={() => update(rows.filter((_, j) => j !== i))} style={{ color: 'var(--coral)' }}><Trash2 size={14} /></button>
          </div>
          <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--t3)' }}>
            <input type="checkbox" checked={s.hours !== null}
              onChange={e => update(rows.map((row, j) => j === i ? { ...row, hours: e.target.checked ? businessHours : null } : row))} />
            Custom hours (different from the business's regular hours)
          </label>
          {s.hours && (
            <HoursSectionField title={`${s.name || 'This team member'}'s hours`} hours={s.hours}
              onChange={next => update(rows.map((row, j) => j === i ? { ...row, hours: next } : row))} />
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "sections/(Text|Hours|Services|Staff)SectionField"`
Expected: no output (no errors in these four files).

- [ ] **Step 6: Commit**

```bash
git add src/components/sections
git commit -m "$(cat <<'EOF'
Extract reusable per-kind section field widgets

Same hours/services/staff editing UX as the old BriefingEditor, split into
standalone components shared by both the client and admin document
editors instead of living inline in one 550-line form.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `AgentDetailsEditor` (client-facing)

**Files:**
- Create: `src/components/AgentDetailsEditor.tsx`

**Interfaces:**
- Consumes: `saveAgentDetails` (Task 6), `TextSectionField`/`HoursSectionField`/`ServicesSectionField`/`StaffSectionField` (Task 7), `PromptSection`/`StructuredDraft` types.

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { saveAgentDetails, type SectionEdit } from '@/app/(dashboard)/agent-details/actions'
import type { StructuredDraft } from '@/lib/briefing'
import type { PromptSection } from '@/lib/promptSections'
import { useNavigationBlocker } from '@/lib/navigationBlocker'
import TextSectionField from './sections/TextSectionField'
import HoursSectionField from './sections/HoursSectionField'
import ServicesSectionField from './sections/ServicesSectionField'
import StaffSectionField from './sections/StaffSectionField'

type Props = {
  businessId: string
  businessName: string
  initialStructured: StructuredDraft
  isPendingReview: boolean
  sections: PromptSection[]
}

export default function AgentDetailsEditor({ businessId, businessName, initialStructured, isPendingReview, sections }: Props) {
  const [structured, setStructured] = useState(initialStructured)
  const [textContent, setTextContent] = useState<Record<string, string>>(
    Object.fromEntries(sections.filter(s => s.kind === 'text').map(s => [s.id, s.draftContent ?? s.content ?? '']))
  )
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  const dirty = useNavigationBlocker(
    JSON.stringify({ structured, textContent }) !== JSON.stringify({ structured: initialStructured, textContent: Object.fromEntries(sections.filter(s => s.kind === 'text').map(s => [s.id, s.draftContent ?? s.content ?? ''])) })
  )

  function handleSave() {
    const sectionEdits: SectionEdit[] = sections
      .filter(s => s.kind === 'text' && textContent[s.id] !== (s.draftContent ?? s.content ?? ''))
      .map(s => ({ id: s.id, content: textContent[s.id] }))

    startTransition(async () => {
      await saveAgentDetails(businessId, { structured, sectionEdits })
      setSaved(true)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Agent Details</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--t5)' }}>
          This is what Ellie actually says on calls for {businessName}. Changes here are reviewed by our team before going live.
        </p>
      </div>

      {isPendingReview && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(217,138,11,0.08)', border: '1px solid rgba(217,138,11,0.25)', color: 'var(--amber)' }}>
          You have changes pending review — they haven&apos;t gone live yet.
        </div>
      )}

      {sections.map(s => {
        if (s.kind === 'text') {
          return (
            <TextSectionField key={s.id} title={s.title} value={textContent[s.id] ?? ''}
              onChange={next => setTextContent(prev => ({ ...prev, [s.id]: next }))} />
          )
        }
        if (s.kind === 'hours_table') {
          return <HoursSectionField key={s.id} title={s.title} hours={structured.hours} onChange={next => setStructured(prev => ({ ...prev, hours: next }))} />
        }
        if (s.kind === 'services_table') {
          return <ServicesSectionField key={s.id} title={s.title} services={structured.services} onChange={next => setStructured(prev => ({ ...prev, services: next }))} />
        }
        return <StaffSectionField key={s.id} title={s.title} staff={structured.staff} businessHours={structured.hours} onChange={next => setStructured(prev => ({ ...prev, staff: next }))} />
      })}

      <div className="flex items-center gap-3 sticky bottom-0 py-3 px-1" style={{ background: 'var(--bg1)' }}>
        <button onClick={handleSave} disabled={isPending}
          className="rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))' }}>
          {isPending ? 'Saving…' : 'Save changes'}
        </button>
        {saved && !isPending && <span className="text-xs" style={{ color: 'var(--signal)' }}>Saved — pending review.</span>}
        {dirty && !isPending && !saved && <span className="text-xs" style={{ color: 'var(--t5)' }}>Unsaved changes</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep AgentDetailsEditor`
Expected: no output.

- [ ] **Step 3: Manual verification**

Run the dev server (`npm run dev`), sign in as the test client used in the "Local Supabase dev setup", visit `/agent-details`. Confirm: text sections show as title+textarea, Hours/Services/Staff show as their existing widgets, editing then "Save changes" round-trips (reload the page — edited text should now show under "pending review" state via `isPendingReview`).

- [ ] **Step 4: Commit**

```bash
git add src/components/AgentDetailsEditor.tsx
git commit -m "$(cat <<'EOF'
Add AgentDetailsEditor — client-facing sectioned document editor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `AdminDocumentEditor` (admin-facing: CRUD + diff review + Apply & Push)

**Files:**
- Create: `src/components/AdminDocumentEditor.tsx`
- Modify: `src/app/admin/clients/[id]/prompt/page.tsx`
- Modify: `src/components/AdminClientHeader.tsx` (drop the `briefing` tab; rename `prompt` tab label)

**Interfaces:**
- Consumes: `addSection`/`removeSection`/`reorderSections`/`setSectionEditable`/`saveSectionDirect`/`applyPendingChanges` (Task 5), `liveStructuredData`/`resolveStructuredData` (Task 4), section field widgets (Task 7).

- [ ] **Step 1: Write `AdminDocumentEditor.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, Send } from 'lucide-react'
import type { PromptSection, SectionKind } from '@/lib/promptSections'
import type { StructuredDraft } from '@/lib/briefing'
import {
  addSection, removeSection, reorderSections, setSectionEditable, saveSectionDirect, applyPendingChanges,
} from '@/app/admin/clients/[id]/prompt/actions'
import HoursSectionField from './sections/HoursSectionField'
import ServicesSectionField from './sections/ServicesSectionField'
import StaffSectionField from './sections/StaffSectionField'

type Props = {
  businessId: string
  sections: PromptSection[]
  liveStructured: StructuredDraft
  draftStructured: StructuredDraft
  hasDraft: boolean
  expectedBriefingUpdatedAt: string | null
}

const KIND_LABEL: Record<SectionKind, string> = {
  text: 'Text', hours_table: 'Hours (structured)', services_table: 'Services (structured)', staff_table: 'Team (structured)',
}

function SectionDiff({ section }: { section: PromptSection }) {
  if (section.draftContent === null) return null
  return (
    <div className="px-5 py-3 text-xs" style={{ background: 'rgba(217,138,11,0.06)', borderTop: '1px solid rgba(217,138,11,0.2)' }}>
      <div style={{ color: 'var(--amber)' }} className="font-semibold mb-1">Client&apos;s pending edit:</div>
      <div className="whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{section.draftContent}</div>
    </div>
  )
}

export default function AdminDocumentEditor({ businessId, sections: initialSections, liveStructured, draftStructured, hasDraft, expectedBriefingUpdatedAt }: Props) {
  const [sections, setSections] = useState(initialSections)
  const [drafts, setDrafts] = useState<Record<string, string>>(Object.fromEntries(initialSections.map(s => [s.id, s.content ?? ''])))
  const [isPending, startTransition] = useTransition()
  const [newTitle, setNewTitle] = useState('')

  const changedSections = sections.filter(s => s.draftContent !== null)
  const structuredChanged = hasDraft

  function move(id: string, dir: -1 | 1) {
    const idx = sections.findIndex(s => s.id === id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= sections.length) return
    const next = [...sections]
    ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    setSections(next)
    startTransition(() => reorderSections(businessId, next.map(s => s.id)))
  }

  function handleAdd() {
    if (!newTitle.trim()) return
    startTransition(async () => {
      await addSection(businessId, { title: newTitle.trim(), headingLevel: 2, kind: 'text', clientEditable: false })
      setNewTitle('')
    })
  }

  function handleSaveSection(id: string) {
    startTransition(() => saveSectionDirect(businessId, id, drafts[id] ?? ''))
  }

  function handleApply() {
    startTransition(() => applyPendingChanges(businessId, expectedBriefingUpdatedAt))
  }

  return (
    <div className="flex flex-col gap-4">
      {(changedSections.length > 0 || structuredChanged) && (
        <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'rgba(217,138,11,0.06)', border: '1px solid rgba(217,138,11,0.25)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--amber)' }}>Pending client changes</h3>
          {changedSections.map(s => <SectionDiff key={s.id} section={s} />)}
          {structuredChanged && (
            <p className="text-xs" style={{ color: 'var(--text)' }}>
              Hours, services, team, greeting, and/or transfer number also have pending changes — review on the fields below before applying.
            </p>
          )}
          <button onClick={handleApply} disabled={isPending}
            className="self-start flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: 'var(--signal)' }}>
            <Send size={13} /> Apply &amp; Push to Vapi
          </button>
        </div>
      )}

      {sections.map((s, i) => (
        <div key={s.id} className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--b3)' }}>
            <div className="flex items-center gap-2">
              <b className="text-sm" style={{ color: 'var(--text)' }}>{'#'.repeat(s.headingLevel)} {s.title}</b>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg2)', color: 'var(--t4)' }}>{KIND_LABEL[s.kind]}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--t3)' }}>
                <input type="checkbox" checked={s.clientEditable}
                  onChange={e => { setSections(sections.map(x => x.id === s.id ? { ...x, clientEditable: e.target.checked } : x)); startTransition(() => setSectionEditable(businessId, s.id, e.target.checked)) }} />
                Client-editable
              </label>
              <button onClick={() => move(s.id, -1)} disabled={i === 0} style={{ color: 'var(--t3)' }}><ChevronUp size={14} /></button>
              <button onClick={() => move(s.id, 1)} disabled={i === sections.length - 1} style={{ color: 'var(--t3)' }}><ChevronDown size={14} /></button>
              <button onClick={() => startTransition(async () => { await removeSection(businessId, s.id); setSections(sections.filter(x => x.id !== s.id)) })} style={{ color: 'var(--coral)' }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {s.kind === 'text' && (
            <div className="p-5 flex flex-col gap-2">
              <textarea value={drafts[s.id] ?? ''} onChange={e => setDrafts(prev => ({ ...prev, [s.id]: e.target.value }))}
                rows={6} className="w-full rounded-xl px-3.5 py-2.5 text-sm resize-y"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              <button onClick={() => handleSaveSection(s.id)} disabled={isPending}
                className="self-start rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--bg2)', color: 'var(--violet)', border: '1px solid var(--border)' }}>
                Save &amp; push this edit now
              </button>
            </div>
          )}
          {s.kind === 'hours_table' && (
            <div className="p-5 flex flex-col gap-3">
              <HoursSectionField title="Live hours" hours={liveStructured.hours} onChange={() => {}} />
              {structuredChanged && JSON.stringify(draftStructured.hours) !== JSON.stringify(liveStructured.hours) && (
                <HoursSectionField title="Pending (client's edit)" hours={draftStructured.hours} onChange={() => {}} />
              )}
            </div>
          )}
          {s.kind === 'services_table' && (
            <div className="p-5 flex flex-col gap-3">
              <ServicesSectionField title="Live services" services={liveStructured.services} onChange={() => {}} />
              {structuredChanged && JSON.stringify(draftStructured.services) !== JSON.stringify(liveStructured.services) && (
                <ServicesSectionField title="Pending (client's edit)" services={draftStructured.services} onChange={() => {}} />
              )}
            </div>
          )}
          {s.kind === 'staff_table' && (
            <div className="p-5 flex flex-col gap-3">
              <StaffSectionField title="Live team" staff={liveStructured.staff} businessHours={liveStructured.hours} onChange={() => {}} />
              {structuredChanged && JSON.stringify(draftStructured.staff) !== JSON.stringify(liveStructured.staff) && (
                <StaffSectionField title="Pending (client's edit)" staff={draftStructured.staff} businessHours={draftStructured.hours} onChange={() => {}} />
              )}
            </div>
          )}

          <SectionDiff section={s} />
        </div>
      ))}

      <div className="flex items-center gap-2">
        <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="New section title (e.g. Clinical Boundaries)"
          className="flex-1 rounded-xl px-3.5 py-2.5 text-sm" style={{ border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)' }} />
        <button onClick={handleAdd} disabled={isPending}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--violet)' }}>
          <Plus size={14} /> Add section
        </button>
      </div>
    </div>
  )
}
```

Note: the structured (Hours/Services/Staff) widgets are rendered here read-only (`onChange={() => {}}`) because their *editable* draft/live cycle already runs through the existing "Details" tab data the admin edits directly on `businesses`/`business_services`/`business_staff` via ordinary admin tooling — this component's job for those three is to show the admin *where in the document* they sit and *whether client_editable*, plus surface the pending diff, not to duplicate a full edit UI the admin already has elsewhere. If, once this ships, the admin wants to edit hours/services/staff live values from this same screen too, that's a follow-up, not required by the spec (which only requires whole-document diff + apply).

- [ ] **Step 2: Rewrite `src/app/admin/clients/[id]/prompt/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { liveStructuredData, resolveStructuredData } from '@/lib/briefing'
import { mapSectionRow } from '@/lib/promptSections'
import AdminClientHeader from '@/components/AdminClientHeader'
import AdminDocumentEditor from '@/components/AdminDocumentEditor'

export default async function AdminPromptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string; emailWarning?: string }>
}) {
  const { id } = await params
  const { created, emailWarning } = await searchParams
  const admin = createAdminClient()

  const { data: biz } = await admin.from('businesses').select('*').eq('id', id).single()
  if (!biz) redirect('/admin/clients')

  const [{ data: services }, { data: staff }, { data: sectionRows }, { data: { user: clientUser } }] = await Promise.all([
    admin.from('business_services').select('*').eq('business_id', biz.id).order('sort_order'),
    admin.from('business_staff').select('*').eq('business_id', biz.id).order('sort_order'),
    admin.from('prompt_sections').select('*').eq('business_id', biz.id).order('sort_order'),
    admin.auth.admin.getUserById(biz.user_id),
  ])

  const liveStructured = liveStructuredData(biz, services ?? [], staff ?? [])
  const draftStructured = resolveStructuredData(biz, services ?? [], staff ?? [])
  const sections = (sectionRows ?? []).map(mapSectionRow)

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-[1220px] mx-auto flex flex-col gap-4">
        <AdminClientHeader id={biz.id} name={biz.name} email={clientUser?.email ?? ''} plan={biz.plan} planStatus={biz.plan_status} hasAssistant={!!biz.vapi_assistant_id} active="prompt" />

        {created === '1' && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(15,163,122,0.07)', border: '1px solid rgba(15,163,122,0.2)', color: 'var(--signal)' }}>
            <b>{biz.name}</b>&nbsp;was created and invited. Add starter sections below, then Apply &amp; Push.
            {emailWarning === '1' && ' (The invite email failed to send — use "Send Password Reset Email" on the Details tab.)'}
          </div>
        )}

        {!biz.vapi_assistant_id && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(221,81,64,0.07)', border: '1px solid rgba(221,81,64,0.2)', color: 'var(--coral)' }}>
            <AlertTriangle size={15} className="shrink-0" /> No Vapi Assistant ID set for this business yet — add one on the Details tab first.
          </div>
        )}

        {biz.vapi_assistant_id && (
          <AdminDocumentEditor
            businessId={biz.id}
            sections={sections}
            liveStructured={liveStructured}
            draftStructured={draftStructured}
            hasDraft={!!biz.draft_briefing}
            expectedBriefingUpdatedAt={biz.briefing_updated_at}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update `AdminClientHeader.tsx`**

Remove the `'briefing'` entry from the `active` union type and from the tabs array (current lines 26 and 81); rename the `'prompt'` tab's `label` from `'System Prompt'` to `'Agent Details'`:

```ts
active: 'details' | 'prompt' | 'campaigns' | 'health' | 'costs'
```
```ts
{ key: 'prompt' as const, href: `/admin/clients/${id}/prompt`, label: 'Agent Details', icon: ScrollText },
```
(delete the `briefing` tab object entirely; `Building2` import becomes unused — remove it from the `lucide-react` import line too)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "AdminDocumentEditor|prompt/page|AdminClientHeader"`
Expected: no output.

- [ ] **Step 5: Manual verification**

Dev server, sign in as admin, visit `/admin/clients/[SASH or Luxe id]/prompt` (once real data exists post-Task-11 — for now, verify against a local test business): confirm section list renders, add/remove/reorder/toggle-editable work, direct text-section save pushes without requiring a client draft, and the "Pending client changes" banner + Apply & Push button only appear when a client has actually submitted an Agent Details edit.

- [ ] **Step 6: Commit**

```bash
git add src/components/AdminDocumentEditor.tsx src/app/admin/clients/\[id\]/prompt/page.tsx src/components/AdminClientHeader.tsx
git commit -m "$(cat <<'EOF'
Add AdminDocumentEditor — section CRUD, diff review, Apply & Push

Collapses the old separate "Company Information" (read-only review) and
"System Prompt" (hand-authored text) admin tabs into one document editor.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: New client creation seeds starter sections

**Files:**
- Modify: `src/app/admin/clients/new/page.tsx`

**Interfaces:**
- Consumes: nothing new — plain inserts against `prompt_sections` using the business fields already collected on this form (`name`, `phone`).

- [ ] **Step 1: Add starter-section seeding after the business insert**

In `createClientAction`, immediately after the existing `businesses.insert(...).select('id').single()` call (current lines 66–76) and its error check (77–81), insert:

```ts
    const STARTER_SECTIONS: { key: string; title: string; headingLevel: 1 | 2 | 3; kind: 'text' | 'hours_table' | 'services_table' | 'staff_table'; content: string | null; clientEditable: boolean }[] = [
      { key: 'identity',   title: 'Identity',        headingLevel: 1, kind: 'text', content: `You are Ellie, the AI receptionist for ${businessName}.`, clientEditable: false },
      { key: 'contact',    title: 'Contact',         headingLevel: 2, kind: 'text', content: (formData.get('phone') as string)?.trim() ? `Phone: ${(formData.get('phone') as string).trim()}` : '', clientEditable: true },
      { key: 'disclosure', title: 'AI Disclosure',   headingLevel: 2, kind: 'text', content: `If asked: "Yes, I'm ${businessName}'s AI receptionist. I'm here to help however I can."`, clientEditable: true },
      { key: 'hours',      title: 'Hours',           headingLevel: 2, kind: 'hours_table', content: null, clientEditable: true },
      { key: 'services',   title: 'Services',        headingLevel: 2, kind: 'services_table', content: null, clientEditable: true },
    ]
    const { error: sectionsErr } = await admin.from('prompt_sections').insert(
      STARTER_SECTIONS.map((s, i) => ({ business_id: biz.id, key: s.key, title: s.title, heading_level: s.headingLevel, kind: s.kind, content: s.content, client_editable: s.clientEditable, sort_order: i }))
    )
    if (sectionsErr) {
      // Non-fatal — the business record and invite already succeeded; the
      // admin can add sections manually from the Agent Details tab.
      console.error('Failed to seed starter prompt_sections:', sectionsErr)
    }
```

The Contact section's one-time seed from the `phone` form field is exactly the "no ongoing sync" seeding the spec calls for — it copies the value once, right here, and nothing links them afterward.

- [ ] **Step 2: Manual verification**

Create a test client through `/admin/clients/new` with a phone number filled in. Confirm on the resulting `/admin/clients/[id]/prompt` page: five sections exist (Identity, Contact, AI Disclosure, Hours, Services), Contact's starting text contains the phone number typed on the form, and editing that section afterward has zero effect on the business's `phone` column (and vice versa).

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/clients/new/page.tsx
git commit -m "$(cat <<'EOF'
Seed starter Agent Details sections on new client creation

One-time copy of the phone number already entered on the creation form
into the Contact section's starting text — never synced again afterward.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Migrate the two live businesses' existing prompts

**Files:**
- Create: `scripts/migrate-existing-prompts-to-sections.mjs`

**Interfaces:**
- Consumes: `splitPromptIntoSections`, `joinSections`, `normalizeWhitespace` (Task 3) — imported directly since this is a plain Node script run against the compiled/transpiled lib, or reimplemented inline if the repo's existing `scripts/*.mjs` files don't import TS directly (check an existing script first).

- [ ] **Step 1: Check how existing scripts handle TS imports**

Run: `head -20 scripts/setup-vapi-tool.mjs`
Note whether it imports from `src/lib/*` directly (via a loader) or is fully self-contained — match that pattern. If self-contained, reimplement `splitPromptIntoSections`/`normalizeWhitespace` inline in this script rather than importing (small, ~30 lines, avoids introducing a new build step for a one-off script).

- [ ] **Step 2: Write the script**

```js
#!/usr/bin/env node
// One-off migration: splits each live business's current Vapi system
// prompt into prompt_sections rows by markdown heading, defaulting every
// section to client_editable=false. Run once per business; safe to re-run
// (it's idempotent per business via a guard on existing sections).
//
// Usage: node scripts/migrate-existing-prompts-to-sections.mjs <business-id> <vapi-assistant-id>

import { createClient } from '@supabase/supabase-js'

const HEADING_RE = /^(#{1,3})\s+(.+)$/

function splitPromptIntoSections(promptText) {
  const lines = promptText.split('\n')
  const sections = []
  let current = null
  let preamble = []
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
      current = { title: m[2].trim(), headingLevel: m[1].length, content: '' }
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

function joinSections(sections) {
  return sections.map(s => `${'#'.repeat(s.headingLevel)} ${s.title}\n\n${s.content}`).join('\n\n')
}

function normalizeWhitespace(text) {
  return text.split('\n').map(l => l.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

async function main() {
  const [businessId, assistantId] = process.argv.slice(2)
  if (!businessId || !assistantId) {
    console.error('Usage: node scripts/migrate-existing-prompts-to-sections.mjs <business-id> <vapi-assistant-id>')
    process.exit(1)
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: existing } = await supabase.from('prompt_sections').select('id').eq('business_id', businessId).limit(1)
  if (existing && existing.length > 0) {
    console.log(`Business ${businessId} already has prompt_sections — skipping (idempotent guard).`)
    return
  }

  const res = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
    headers: { Authorization: `Bearer ${process.env.VAPI_PRIVATE_KEY}` },
  })
  if (!res.ok) throw new Error(`Vapi fetch failed: ${res.status} ${await res.text()}`)
  const assistant = await res.json()
  const liveSystemPrompt = assistant.model?.messages?.find(m => m.role === 'system')?.content
  if (!liveSystemPrompt) throw new Error('No system message found on this assistant')

  const split = splitPromptIntoSections(liveSystemPrompt)
  if (split.length === 0) throw new Error('No markdown headings found — nothing to split. Migrate this one by hand.')

  const rejoined = joinSections(split)
  if (normalizeWhitespace(rejoined) !== normalizeWhitespace(liveSystemPrompt)) {
    console.error('Round-trip check FAILED — split+rejoin does not match the original (modulo whitespace). Aborting without writing anything.')
    console.error('--- original ---\n', liveSystemPrompt)
    console.error('--- rejoined ---\n', rejoined)
    process.exit(1)
  }
  console.log(`Round-trip check passed for business ${businessId} — ${split.length} sections.`)

  const rows = split.map((s, i) => ({
    business_id: businessId,
    key: `migrated_${i}_${s.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)}`,
    title: s.title,
    heading_level: s.headingLevel,
    kind: 'text',
    content: s.content,
    client_editable: false,
    sort_order: i,
  }))

  const { error } = await supabase.from('prompt_sections').insert(rows)
  if (error) throw new Error(error.message)

  console.log(`Inserted ${rows.length} sections for business ${businessId}. All client_editable=false — flip individual sections on from the admin Agent Details tab.`)
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 3: Dry-run against SASH Hair Straightening Salon**

Run: `node scripts/migrate-existing-prompts-to-sections.mjs 08c90a58-90a6-4e64-bb97-33a8e4842e2e 43f72ac6-1e88-4106-8227-47a0f9e149b5`
Expected: "Round-trip check passed" followed by "Inserted N sections". If the round-trip check fails, stop — do not proceed to Step 4 until the split logic handles whatever formatting quirk this specific prompt has (inspect the printed original/rejoined diff).

- [ ] **Step 4: Verify in the DB**

Run (via `mcp__supabase__execute_sql` against project `enhclrpqaxgbckfbstcv`, or `supabase db execute` if running against local first): `select title, heading_level, kind, length(content) from prompt_sections where business_id = '08c90a58-90a6-4e64-bb97-33a8e4842e2e' order by sort_order;`
Expected: one row per top-level heading in SASH's live prompt, all `kind = 'text'`.

- [ ] **Step 5: Repeat for Luxe Nails & Beauty**

Run: `node scripts/migrate-existing-prompts-to-sections.mjs 365ec02c-7d39-4ff7-9592-fc69017cb865 f5bd892b-40b1-45df-8cc5-e127f4b4afe0`
Expected: same as Step 3/4, for this second business.

- [ ] **Step 6: Confirm neither push happened**

Run: `grep -c "syncAssistantPrompt\|updateAssistant" scripts/migrate-existing-prompts-to-sections.mjs`
Expected: `0` — this script only reads from Vapi and writes to Supabase; it never pushes anything back to Vapi, so the two live assistants are completely unaffected until an admin explicitly hits "Apply & Push" later from the new UI.

- [ ] **Step 7: Commit**

```bash
git add scripts/migrate-existing-prompts-to-sections.mjs
git commit -m "$(cat <<'EOF'
Add one-off script to migrate existing hand-authored prompts to sections

Run against SASH Hair Straightening Salon and Luxe Nails & Beauty — the
only two businesses with a live vapi_assistant_id. Read-only against Vapi;
never pushes, so their live assistants are unaffected until an admin
explicitly applies changes through the new Agent Details UI.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Cutover — remove old Briefing/Prompt UI, update nav and docs

**Files:**
- Delete: `src/app/(dashboard)/briefing/page.tsx`, `actions.ts`, `loading.tsx`
- Delete: `src/app/admin/clients/[id]/briefing/page.tsx`, `actions.ts`, `loading.tsx`
- Delete: `src/components/BriefingEditor.tsx`, `BriefingReadOnly.tsx`, `AdminCompanyInfoEditor.tsx`, `SystemPromptEditor.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/app/admin/clients/page.tsx`
- Modify: `PROJECT_CONTEXT.md`

**Interfaces:**
- Consumes: nothing new — pure cleanup + doc update.

- [ ] **Step 1: Delete the dead route directories and components**

```bash
git rm -r "src/app/(dashboard)/briefing" "src/app/admin/clients/[id]/briefing"
git rm src/components/BriefingEditor.tsx src/components/BriefingReadOnly.tsx src/components/AdminCompanyInfoEditor.tsx src/components/SystemPromptEditor.tsx
```

- [ ] **Step 2: Update `src/components/Sidebar.tsx`**

Change the nav entry (current line 21):
```ts
{ href: '/agent-details', label: 'Agent Details', icon: Building2 },
```
(from `{ href: '/briefing', label: 'Business', icon: Building2 }`)

- [ ] **Step 3: Update `src/app/admin/clients/page.tsx`**

Run: `grep -n "/briefing" src/app/admin/clients/page.tsx`
Change any link pointing at `/admin/clients/${id}/briefing` to `/admin/clients/${id}/prompt` (the merged Agent Details admin tab).

- [ ] **Step 4: Full-repo sweep for anything missed**

Run: `grep -rln "'/briefing'\|\"/briefing\"\|/briefing\`\|BriefingEditor\|BriefingReadOnly\|AdminCompanyInfoEditor\|SystemPromptEditor\|buildAssistantConfig\|patchPromptSections\|saveDraftBriefing\|liveBriefing\|resolveBriefing\b" --include="*.ts" --include="*.tsx" src/`
Expected: no output. Fix anything that shows up before continuing.

- [ ] **Step 5: Full type-check and test run**

Run: `npx tsc --noEmit && npm test`
Expected: zero errors, all tests pass.

- [ ] **Step 6: Update `PROJECT_CONTEXT.md`**

Replace the entire "## The Briefing draft/live split (why it exists)" section with:

```markdown
## The Agent Details document model (why it exists)

Client edits to hours/services/company info used to write into a
different data shape than the hand-authored Vapi system prompt — a
client filled in structured fields, and an admin separately maintained
prompt prose that had to be manually kept in sync via HTML-comment
markers (`<!-- briefing:KEY -->`). The two drifted, and real prompts
carry nuance (location-alias disambiguation, catalogue caveats) no fixed
schema could hold.

Fixed by treating the prompt itself as the data model: `prompt_sections`
holds an ordered, per-business list of named sections whose
concatenation (`compileSystemPrompt()` in `src/lib/promptSections.ts`) *is*
the Vapi system prompt. Three section kinds (`hours_table`/
`services_table`/`staff_table`) render from the existing structured
tables (`businesses.hours`, `business_services`, `business_staff`) because
`checkAvailability`/`bookAppointment` parse them programmatically and
`appointments.staff_id` FKs into `business_staff` — every other section is
free text, edited verbatim, no formatting layer.

- Client-facing: `/agent-details` (`src/app/(dashboard)/agent-details/`)
  renders only `client_editable = true` sections. Edits stage as
  `draft_content` per text row, or in `businesses.draft_briefing` for the
  three structured kinds plus greeting/transfer number (same
  `briefing_needs_review`/`briefing_updated_at` flags as before).
- Admin-facing: `/admin/clients/[id]/prompt` (`AdminDocumentEditor`) is
  the full document — add/remove/reorder sections, toggle
  `client_editable`, edit any section directly, and "Apply & Push"
  promotes every pending draft at once, recompiles, and pushes to Vapi in
  one action (`applyPendingChanges` in
  `src/app/admin/clients/[id]/prompt/actions.ts`) — same
  DB-write-before-Vapi-push ordering as before, same "leave the pending
  flag set on Vapi failure" behavior.
- New clients are seeded with a handful of starter sections at creation
  (`src/app/admin/clients/new/page.tsx`), including a one-time-only copy
  of any operational field (e.g. phone) already typed on the creation
  form into a starting section body — never re-synced afterward.
- Existing clients' prompts were migrated once via
  `scripts/migrate-existing-prompts-to-sections.mjs`, splitting their live
  hand-authored prompt into sections by markdown heading — see
  `docs/superpowers/specs/2026-09-15-agent-details-document-model-design.md`.
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Cut over to Agent Details: remove old Briefing/Prompt UI, update nav+docs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:** operational-record/document split → Task 1+Task 4 non-goals note; hours/services/staff stay structured → Tasks 1/2/5/7/8/9; free text per section (not sub-fields) → Task 7's `TextSectionField`; whole-document approval → `applyPendingChanges` (Task 5), not per-section; client "Agent Details" experience → Tasks 6/8; admin document editor with diff review → Task 9; new-client seeding, one-time only → Task 10; migration for existing clients → Task 11 (run against the two confirmed live businesses, SASH and Luxe); error handling (DB-before-Vapi-push, dirty flag left on failure) → preserved verbatim in Task 5's `applyPendingChanges`/`saveSectionDirect`; testing (compile ordering/heading/interleaving, split round-trip) → Tasks 2/3; cutover/cleanup → Task 12, including the `transfer_phone_number` clarification the spec itself didn't call out explicitly (documented in Global Constraints, preserved unchanged throughout).

**Placeholder scan:** none found — every step has runnable code or an exact command.

**Type consistency:** `PromptSection`/`SectionKind`/`Hours`/`ServiceDraft`/`StaffDraft`/`StructuredDocumentData` are defined once in `src/lib/promptSections.ts` (Task 2) and imported by name everywhere else (Tasks 4–11) rather than redefined; `StructuredDraft` is defined once in `src/lib/briefing.ts` (Task 4) and imported by name in Tasks 5, 6, 8, 9. `mapSectionRow()` is the single row→type mapper, used in Tasks 5, 6, 9.
