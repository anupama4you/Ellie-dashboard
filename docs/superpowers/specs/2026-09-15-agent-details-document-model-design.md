# Agent Details: a sectioned-document model replacing Business/Prompt duplication

Status: approved for planning
Date: 2026-09-15

## Context

Today a client's business facts live in two places that don't actually
describe the same thing:

- Structured `businesses` columns / `business_services` / `business_faqs`
  (hours, services, FAQs, company info) — edited by the client on the
  Briefing page, staged in `businesses.draft_briefing`, applied to live
  columns only via admin "Apply & Push."
- The hand-authored Vapi system prompt — free text, only the *factual*
  slices of which (`<!-- briefing:KEY -->` markers) get surgically patched
  from the structured data by `patchPromptSections()`
  (`src/lib/assistantPrompt.ts`).

This forces double entry (fill the form, then also write matching prose)
and the two drift, because real prompts carry nuance a fixed schema can't
hold — see the Face & Body Adelaide example prompt used during
brainstorming: its Locations section isn't "an address," it's alias
disambiguation logic (Mile End vs. Torrensville); its Services section
isn't "name + price," it's catalogue-discrepancy warnings the LLM has to
reason about. `fmtLocation()`/`fmtServices()`-style formatting can never
produce that. Existing clients also have zero `briefing:` markers in their
live prompts today — an admin has to hand-insert them once before any
sync can work at all.

This is unrelated to the ongoing multi-location four-part decomposition
(tracked separately) — it replaces the Briefing↔Prompt pipeline itself,
independent of how many locations a business has.

## Goals

- One document per business is the single source of truth for what Ellie
  says. No separate "Business" page whose values get reformatted into
  prompt prose.
- The client edits real prompt content directly, scoped to whichever
  sections the admin has exposed to them, as plain titled text — not a
  form that gets translated.
- Admin review/approval stays a single whole-document bundle, matching
  today's Apply & Push mental model.
- Hours, Services, and Staff remain machine-readable, because
  `checkAvailability`/`bookAppointment` parse them programmatically and
  `appointments.staff_id` FKs into `business_staff` — everything else
  becomes free text.
- New clients start from a non-blank document (company info the admin
  already typed at creation seeds the first draft of relevant sections).
- Existing clients migrate with no hand-editing required to bootstrap.

## Non-goals

- No LLM-based parsing or generation anywhere in this feature — the repo
  has no LLM client today and none is being introduced. Section content
  is always exactly what a human (client or admin) typed.
- No change to webhook tool-call logic
  (`src/app/api/vapi-webhook/route.ts`) — `checkAvailability`/
  `bookAppointment` keep reading `businesses.hours`/`business_services`/
  `business_staff` directly, unchanged in shape.
- No per-section (partial) approval — confirmed during brainstorming,
  whole-document bundle only, same as today.
- No per-field granularity inside a text section — a section is one
  title + one body, edited as a unit.
- No ongoing sync between the operational business record (address,
  phone, etc.) and document sections after a section's one-time seed —
  see Data model.

## Data model

Two changes. First, a new table for the document itself:

```sql
create table if not exists public.prompt_sections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  key text not null,                  -- stable slug, e.g. 'ai_disclosure'
  title text not null,                -- rendered as the markdown heading
  heading_level smallint not null default 2 check (heading_level between 1 and 3),
  kind text not null default 'text'
    check (kind in ('text', 'hours_table', 'services_table', 'staff_table')),
  content text,                       -- prose body; null for structured kinds
  draft_content text,                 -- pending client edit; null = none pending
  client_editable boolean not null default false,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  unique (business_id, key)
);
```

`kind = 'text'` sections store their body directly on the row (`content`
live, `draft_content` pending). `kind = 'hours_table' | 'services_table'
| 'staff_table'` sections store nothing here — they're placeholders that
mark *where in the document* the existing structured data renders
(`businesses.hours`, `business_services`, `business_staff`), reusing the
existing `fmtHours`/`fmtServices`/`fmtStaff` formatters from
`assistantPrompt.ts`. Their pending-edit staging keeps using the
existing `businesses.draft_briefing` jsonb + `briefing_needs_review` /
`briefing_updated_at` columns exactly as today (that mechanism already
works — diff-sync for staff, delete/reinsert for services — no reason to
rebuild it).

Second, `business_faqs`, the `description`/`website`/`address`/`city`/
`state`/`postcode`/`google_maps_url` columns on `businesses`, and the
legacy `transfer_rules`/`custom_instructions` columns stop being prompt
inputs. They aren't dropped (some may still serve the admin's own
back-office reference, e.g. an address on the client list) — they simply
have no more formatting/sync code pointing at them. Their content becomes
ordinary `prompt_sections` rows (FAQs as one free-text section rather
than rigid Q/A rows — confirmed during brainstorming, since no tool logic
reads FAQ rows programmatically).

## Compilation

`buildAssistantConfig()`'s giant template literal and
`patchPromptSections()`'s marker-hunting are both replaced by one
function in `src/lib/assistantPrompt.ts`:

```ts
function compileSystemPrompt(sections: PromptSection[], businessData: {...}): string
```

Iterates `sections` in `sort_order`, renders each as `'#'.repeat(heading_level)
+ ' ' + title` followed by its body — `content` for text sections,
`fmtHours(businessData.hours)` / `fmtServices(businessData.services)` /
`fmtStaff(businessData.staff)` for structured ones — and joins them. This
is the entire system prompt; nothing outside this list contributes to it.

## Client experience ("Agent Details")

Replaces the Briefing page (`src/app/(dashboard)/briefing/`). Fetches the
business's `prompt_sections` filtered to `client_editable = true`, ordered
by `sort_order`. Renders each as a titled card:

- `kind = 'text'`: title + textarea, showing `draft_content ?? content`.
- `kind = 'hours_table' | 'services_table' | 'staff_table'`: the existing
  day-grid / service-row / staff-row editors, showing draft-preferred
  values exactly as `resolveBriefing()` does today.

Saving writes `draft_content` on changed text-section rows and/or
`draft_briefing` for structured sections, and sets
`briefing_needs_review = true`, `briefing_updated_at = now()` — same
staging semantics as today, just spread across `prompt_sections` rows
instead of one `draft_briefing` blob holding everything.

## Admin experience

The Prompt tab (`src/app/admin/clients/[id]/prompt/`) becomes the
document editor:

- Full section list, including admin-only ones (booking-flow script,
  clinical-boundary rules, transfer logic) that the client never sees.
- Add / remove / reorder sections; toggle `client_editable` per section;
  edit `content` directly (admin's own edits write straight to `content`,
  no draft cycle — the draft cycle exists for *client* submissions to be
  reviewable, not to gate the admin's own authoring).
- A review view highlighting sections with a non-null `draft_content` (or
  pending `draft_briefing` for structured ones) as before/after diffs —
  same "Changed" pill concept as today's Briefing review, generalized to
  the section list.
- One "Apply & Push" action: for every section with a pending draft,
  `content = draft_content, draft_content = null`; for structured
  sections, the same diff-sync/delete-reinsert logic
  `applyDraftAndPushPrompt()` already has today, driven from
  `draft_briefing`. Then `compileSystemPrompt()` runs over the now-live
  section list and pushes the result via the existing
  `syncAssistantPrompt()` — same DB-write-before-Vapi-push ordering, same
  "leave draft flags dirty on Vapi failure" behavior as today's
  `applyDraftAndPushPrompt`.

`adminSaveSystemPrompt()`'s "wording-only tweak, don't touch drafts" path
maps directly to an admin editing a section's `content` and re-pushing
without going through the draft/approve cycle at all — the distinction
that mattered before (does this touch a pending client change or not)
still holds, it's just scoped per-section now instead of all-or-nothing.

## New client creation

`src/app/admin/clients/new/` gains no new required fields. After the
`businesses` row is created, a small set of starter `prompt_sections` rows
are seeded (Identity, Locations, Contact, Hours, Services, AI Disclosure —
the sections essentially every client needs), each `client_editable =
true` by default. Any of `name`/`phone`/`timezone` the admin already
entered pre-fills the relevant section's `content` as a starting paragraph
(one-time copy at creation, per the "no ongoing sync" non-goal — editing
the section afterward never touches the operational columns, and vice
versa). The admin is still redirected straight to the Prompt tab, now
looking at a non-empty document they refine rather than a blank prompt
box.

## Migration for existing clients

One-time script, run per business with a `vapi_assistant_id`:

1. Fetch the assistant's current live prompt from Vapi (the same call the
   Prompt tab already makes to display it today).
2. Split on markdown headings (`#`/`##`/`###`) into ordered
   `prompt_sections` rows — heading text becomes `title`, heading depth
   becomes `heading_level`, the text until the next heading becomes
   `content`. Everything defaults to `client_editable = false`.
3. Existing `business_services`/`business_staff` data gets one
   `hours_table`/`services_table`/`staff_table` placeholder row inserted
   at a sensible position (immediately following the section whose
   heading text matches "hours"/"services"/"team" if found by simple
   keyword match, otherwise appended at the end for the admin to
   reposition).
4. Nothing pushes to Vapi during migration — `compileSystemPrompt()`
   over the freshly split sections should reproduce the original prompt
   byte-for-byte (modulo the inserted structured-section markers), which
   the script asserts before moving on to the next business.

No admin action is required for existing clients to keep working exactly
as before; they gain the ability to flip specific sections to
client-editable at their own pace.

## Error handling

Unchanged failure semantics from today's `applyDraftAndPushPrompt`: DB
writes (section content promotion, structured-table sync) happen before
the Vapi push; if the Vapi push fails, the now-live sections stay live
(tools are correct) but `briefing_needs_review` stays true so the
mismatch is visible, rather than silently rolling back.

## Testing

- Unit tests for `compileSystemPrompt()`: section ordering, heading-level
  rendering, correct interleaving of text and structured sections.
- Unit test for the migration split: a multi-heading sample prompt
  (using the Face & Body Adelaide example text) round-trips through
  split → compile back to identical text.
- Manual end-to-end pass on a test client: client edits a text section
  and the Hours table on Agent Details → admin sees both as diffs on the
  review screen → Apply & Push → Vapi prompt reflects the new text →
  `checkAvailability` still resolves correctly (structured tables
  unchanged in shape, so webhook logic needs no test changes).
- Regression: an unmigrated-in-practice business (script run, no manual
  edits after) produces a live Vapi prompt identical to its pre-migration
  prompt.

## Open questions

None outstanding — scope was confirmed during brainstorming: free text
per section (not structured sub-fields) for everything except Hours/
Services/Staff, whole-document approval (not per-section), and one-time
(not ongoing) seeding of new sections from operational columns.
