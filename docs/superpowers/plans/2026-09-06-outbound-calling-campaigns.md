# Outbound Calling Campaigns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a client upload a spreadsheet of contacts per location and have Ellie place outbound calls to them in manual batches, with results tracked on a new client-facing Campaigns page.

**Architecture:** Two new tables (`outbound_campaigns`, `outbound_campaign_contacts`) scoped to one `business_id` each, following the existing per-location RLS pattern. CSV upload is parsed in-memory (no file storage). "Call next batch" is a plain server action that places a handful of direct Vapi API calls and returns immediately — no cron/background infrastructure. Outcomes flow back through the *existing* `end-of-call-report` webhook path, extended with one small hook.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase (Postgres + Auth), Vapi REST API, `papaparse` (new dependency, CSV parsing), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-06-outbound-calling-campaigns-design.md`

## Global Constraints

- No filtering/rules engine — the uploaded CSV is the call list as-is.
- No cron/scheduled infrastructure — batches are placed by a button click only.
- A campaign belongs to exactly one `business_id` (location) — no cross-location campaigns.
- Outbound calls are only ever placed 9:00am–8:00pm in the business's own timezone (via `src/lib/timezone.ts`, never a bare `Date`/local-clock check).
- A campaign cannot place calls until `consent_confirmed_at` is set (status `active`).
- Follow existing code conventions: single-purpose migration files in `supabase/migrations/`, the `dashboard_features`/`FEATURE_REGISTRY` toggle pattern, the client-dashboard CSS custom properties (`var(--card)`, `var(--line)`, `var(--ink)`, `var(--ink-3)`, `var(--violet)`, `var(--coral)`, `var(--amber)`, `var(--amber-soft)`, `var(--shadow)`, `var(--font-display)`).

---

### Task 1: Database migration — `outbound_campaigns` and `outbound_campaign_contacts`

**Files:**
- Create: `supabase/migrations/20260906000000_outbound_campaigns.sql`

**Interfaces:**
- Produces: `public.outbound_campaigns(id, business_id, name, status, consent_confirmed_at, created_at)`, `public.outbound_campaign_contacts(id, campaign_id, name, phone, note, status, vapi_call_id, outcome, created_at)`, both RLS-enabled.

- [ ] **Step 1: Write the migration file**

```sql
-- Run this in your Supabase SQL editor.
-- Outbound calling campaigns: a client uploads a spreadsheet of contacts
-- (already filtered by them — no in-app filtering logic) and Ellie places
-- calls to them in manual batches. Scoped to one location (business_id)
-- like every other per-location resource. See
-- docs/superpowers/specs/2026-09-06-outbound-calling-campaigns-design.md.

create table if not exists public.outbound_campaigns (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid references public.businesses(id) on delete cascade not null,
  name                 text not null,
  status               text not null default 'draft', -- draft | active | completed
  consent_confirmed_at timestamptz,
  created_at           timestamptz not null default now()
);

alter table public.outbound_campaigns enable row level security;

create policy "Users see own campaigns"
  on public.outbound_campaigns for all
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create index on public.outbound_campaigns(business_id);

create table if not exists public.outbound_campaign_contacts (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid references public.outbound_campaigns(id) on delete cascade not null,
  name         text not null,
  phone        text not null,
  note         text,
  status       text not null default 'pending', -- pending | calling | done
  vapi_call_id text,
  outcome      text,
  created_at   timestamptz not null default now()
);

alter table public.outbound_campaign_contacts enable row level security;

create policy "Users see own campaign contacts"
  on public.outbound_campaign_contacts for all
  using (campaign_id in (
    select id from public.outbound_campaigns where business_id in (
      select id from public.businesses where user_id = auth.uid()
    )
  ));

create index on public.outbound_campaign_contacts(campaign_id);
create unique index on public.outbound_campaign_contacts(vapi_call_id) where vapi_call_id is not null;
```

- [ ] **Step 2: Apply the migration to the local database**

If a local Supabase stack is running (`npx supabase status` shows it up), apply without wiping existing data:

Run: `npx supabase migration up`

If nothing is running, start it first: `npx supabase start` (this applies every migration automatically, including this new one).

- [ ] **Step 3: Verify the tables exist**

Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\d outbound_campaigns" -c "\d outbound_campaign_contacts"`
Expected: both tables listed with the columns above, RLS enabled, the policies present, and the partial unique index on `outbound_campaign_contacts(vapi_call_id)`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260906000000_outbound_campaigns.sql
git commit -m "$(cat <<'EOF'
Add outbound_campaigns and outbound_campaign_contacts tables

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Feature registry entry + Sidebar nav

**Files:**
- Modify: `src/lib/dashboardFeatures.ts`
- Modify: `src/lib/dashboardFeatures.test.ts`
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Produces: `FeatureKey` now includes `'campaigns'`; `FEATURE_REGISTRY` has a matching entry; `Sidebar`'s `NAV` array has a `/campaigns` entry gated by `features.campaigns`.

- [ ] **Step 1: Update `src/lib/dashboardFeatures.ts`**

Change:
```ts
export type FeatureKey = 'appointments' | 'staff' | 'sms'
```
to:
```ts
export type FeatureKey = 'appointments' | 'staff' | 'sms' | 'campaigns'
```

Change the `FEATURE_REGISTRY` array (add the new entry at the end):
```ts
export const FEATURE_REGISTRY: { key: FeatureKey; label: string; description: string }[] = [
  { key: 'appointments', label: 'Appointments', description: 'Appointments nav page and in-dashboard booking list.' },
  { key: 'staff',        label: 'Staff',         description: 'Staff subsection in Briefing and the staff column/filter on Appointments.' },
  { key: 'sms',          label: 'Messages',      description: 'Messages nav page (the inbound/outbound SMS inbox).' },
  { key: 'campaigns',    label: 'Campaigns',     description: 'Campaigns nav page (upload a contact list and place outbound calls to it).' },
]
```

- [ ] **Step 2: Update the existing test expectations in `src/lib/dashboardFeatures.test.ts`**

The `resolveDashboardFeatures` tests assert full-object equality — add `campaigns: true` to both expected objects. Change:
```ts
  it('resolves every registry key, defaulting to true', () => {
    expect(resolveDashboardFeatures({ dashboard_features: { staff: false } })).toEqual({
      appointments: true,
      staff: false,
      sms: true,
    })
  })

  it('resolves all-true for a business with no dashboard_features set', () => {
    expect(resolveDashboardFeatures({})).toEqual({
      appointments: true,
      staff: true,
      sms: true,
    })
  })
```
to:
```ts
  it('resolves every registry key, defaulting to true', () => {
    expect(resolveDashboardFeatures({ dashboard_features: { staff: false } })).toEqual({
      appointments: true,
      staff: false,
      sms: true,
      campaigns: true,
    })
  })

  it('resolves all-true for a business with no dashboard_features set', () => {
    expect(resolveDashboardFeatures({})).toEqual({
      appointments: true,
      staff: true,
      sms: true,
      campaigns: true,
    })
  })
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run src/lib/dashboardFeatures.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 4: Add the nav entry to `src/components/Sidebar.tsx`**

Add `Megaphone` to the lucide-react import line (currently):
```ts
import { LayoutDashboard, Phone, CalendarDays, Clock, MessageSquare, BarChart3, Building2, Plug, Settings, LogOut, ShieldCheck, X, Menu, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react'
```
to:
```ts
import { LayoutDashboard, Phone, CalendarDays, Clock, MessageSquare, BarChart3, Building2, Plug, Settings, LogOut, ShieldCheck, X, Menu, ChevronsLeft, ChevronsRight, Loader2, Megaphone } from 'lucide-react'
```

Add a new entry to the `NAV` array, right after the `sms` entry:
```ts
const NAV = [
  { href: '/',             label: 'Dashboard',           icon: LayoutDashboard },
  { href: '/calls',        label: 'Calls',               icon: Phone           },
  { href: '/appointments', label: 'Appointments',        icon: CalendarDays,   feature: 'appointments' as FeatureKey },
  { href: '/recordings',   label: 'Recordings',          icon: Clock           },
  { href: '/sms',          label: 'Messages',            icon: MessageSquare,  feature: 'sms' as FeatureKey },
  { href: '/campaigns',    label: 'Campaigns',           icon: Megaphone,      feature: 'campaigns' as FeatureKey },
  { href: '/analytics',    label: 'Analytics',           icon: BarChart3       },
  { href: '/briefing',     label: 'Business', icon: Building2       },
  { href: '/integrations', label: 'Integrations',        icon: Plug            },
  { href: '/settings',     label: 'Settings',            icon: Settings        },
]
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (the `Sidebar` component already filters `NAV` by `!item.feature || features[item.feature]`, and `features` is a `Record<FeatureKey, boolean>` computed from `resolveDashboardFeatures` — adding a key to both in sync keeps everything aligned with no other call site needing changes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboardFeatures.ts src/lib/dashboardFeatures.test.ts src/components/Sidebar.tsx
git commit -m "$(cat <<'EOF'
Add a campaigns dashboard-feature toggle and Sidebar nav entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: CSV contact parsing

**Files:**
- Create: `src/lib/outboundCsv.ts`
- Test: `src/lib/outboundCsv.test.ts`
- Modify: `package.json` (add `papaparse` + `@types/papaparse`)

**Interfaces:**
- Produces: `parseContactsCsv(csvText: string): { valid: { name: string; phone: string; note: string | null }[]; skipped: number }`

- [ ] **Step 1: Install the CSV parsing dependency**

Run: `npm install papaparse && npm install -D @types/papaparse`

- [ ] **Step 2: Write the failing test**

Create `src/lib/outboundCsv.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseContactsCsv } from './outboundCsv'

describe('parseContactsCsv', () => {
  it('parses valid rows with name, phone, and note', () => {
    const csv = 'name,phone,note\nJane Doe,0412345678,Last visited March\nJohn Roe,0498765432,'
    const result = parseContactsCsv(csv)
    expect(result.valid).toEqual([
      { name: 'Jane Doe', phone: '+61412345678', note: 'Last visited March' },
      { name: 'John Roe', phone: '+61498765432', note: null },
    ])
    expect(result.skipped).toBe(0)
  })

  it('skips a row missing a name', () => {
    const csv = 'name,phone\n,0412345678'
    const result = parseContactsCsv(csv)
    expect(result.valid).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('skips a row missing a phone', () => {
    const csv = 'name,phone\nJane Doe,'
    const result = parseContactsCsv(csv)
    expect(result.valid).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('skips a row with an unresolvable phone number', () => {
    const csv = 'name,phone\nJane Doe,12345'
    const result = parseContactsCsv(csv)
    expect(result.valid).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('is case-insensitive and trims header names', () => {
    const csv = ' Name , Phone \nJane Doe,0412345678'
    const result = parseContactsCsv(csv)
    expect(result.valid).toEqual([{ name: 'Jane Doe', phone: '+61412345678', note: null }])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/outboundCsv.test.ts`
Expected: FAIL — `./outboundCsv` module doesn't exist yet.

- [ ] **Step 4: Write `src/lib/outboundCsv.ts`**

```ts
import Papa from 'papaparse'
import { toE164Au } from '@/lib/sms'

export type ParsedContact = { name: string; phone: string; note: string | null }

export type ParseContactsResult = {
  valid: ParsedContact[]
  skipped: number
}

const AU_E164 = /^\+61\d{9}$/

/**
 * Parses an uploaded contacts CSV. Expected columns: name, phone, and an
 * optional note. A row missing name/phone, or whose phone doesn't resolve
 * to a valid AU E.164 number, is skipped and counted rather than silently
 * dropped without explanation — the caller reports the skipped count back
 * to the client.
 */
export function parseContactsCsv(csvText: string): ParseContactsResult {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  const valid: ParsedContact[] = []
  let skipped = 0

  for (const row of data) {
    const name = row.name?.trim()
    const rawPhone = row.phone?.trim()
    if (!name || !rawPhone) { skipped++; continue }

    const phone = toE164Au(rawPhone)
    if (!AU_E164.test(phone)) { skipped++; continue }

    valid.push({ name, phone, note: row.note?.trim() || null })
  }

  return { valid, skipped }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/outboundCsv.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/outboundCsv.ts src/lib/outboundCsv.test.ts
git commit -m "$(cat <<'EOF'
Add CSV contact parsing for outbound campaign uploads

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Vapi outbound-call wrapper

**Files:**
- Modify: `src/lib/vapi.ts`
- Test: `src/lib/vapi.test.ts` (new)

**Interfaces:**
- Produces: `resolveOutboundPhoneNumberId(phoneNumbers: VapiPhoneNumber[], twilioNumber: string): string | null`; `createOutboundCall(opts: { assistantId: string; phoneNumberId: string; customerNumber: string; variableValues?: Record<string, string> }): Promise<{ id: string }>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/vapi.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveOutboundPhoneNumberId, type VapiPhoneNumber } from './vapi'

describe('resolveOutboundPhoneNumberId', () => {
  const phoneNumbers: VapiPhoneNumber[] = [
    { id: 'vapi-pn-1', number: '+61812345678' },
    { id: 'vapi-pn-2', number: '+61887654321' },
  ]

  it('returns the id of the matching phone number', () => {
    expect(resolveOutboundPhoneNumberId(phoneNumbers, '+61887654321')).toBe('vapi-pn-2')
  })

  it('returns null when no phone number matches', () => {
    expect(resolveOutboundPhoneNumberId(phoneNumbers, '+61800000000')).toBeNull()
  })

  it('returns null for an empty list', () => {
    expect(resolveOutboundPhoneNumberId([], '+61887654321')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/vapi.test.ts`
Expected: FAIL — `resolveOutboundPhoneNumberId` is not exported from `./vapi`.

- [ ] **Step 3: Add the two functions to `src/lib/vapi.ts`**

Add after the existing `getPhoneNumber` function:

```ts
/**
 * Matches a business's Twilio number (E.164, as stored in
 * businesses.twilio_phone_number) against Vapi's list of imported phone
 * number resources, to find the id an outbound call needs — Vapi's /call
 * endpoint takes a phoneNumberId, not a raw number string. Pure so it's
 * unit-testable without hitting Vapi's API.
 */
export function resolveOutboundPhoneNumberId(
  phoneNumbers: VapiPhoneNumber[],
  twilioNumber: string,
): string | null {
  return phoneNumbers.find(p => p.number === twilioNumber)?.id ?? null
}

export async function createOutboundCall(opts: {
  assistantId: string
  phoneNumberId: string
  customerNumber: string
  variableValues?: Record<string, string>
}): Promise<{ id: string }> {
  return vapiRequest('/call', {
    method: 'POST',
    body: JSON.stringify({
      assistantId: opts.assistantId,
      phoneNumberId: opts.phoneNumberId,
      customer: { number: opts.customerNumber },
      ...(opts.variableValues ? { assistantOverrides: { variableValues: opts.variableValues } } : {}),
    }),
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/vapi.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/vapi.ts src/lib/vapi.test.ts
git commit -m "$(cat <<'EOF'
Add Vapi outbound-call placement and phone-number-id resolution

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Daytime calling-window guard

**Files:**
- Create: `src/lib/outboundWindow.ts`
- Test: `src/lib/outboundWindow.test.ts`

**Interfaces:**
- Consumes: `hourInZone` from `@/lib/timezone` (existing)
- Produces: `isWithinOutboundCallingWindow(now: Date, timeZone: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/lib/outboundWindow.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isWithinOutboundCallingWindow } from './outboundWindow'

describe('isWithinOutboundCallingWindow', () => {
  const timeZone = 'Australia/Adelaide'

  it('allows a time inside the window', () => {
    // 2026-01-15T00:00:00Z is 10:30am in Adelaide (ACDT, UTC+10:30 in January)
    const inside = new Date('2026-01-15T00:00:00.000Z')
    expect(isWithinOutboundCallingWindow(inside, timeZone)).toBe(true)
  })

  it('blocks a time before 9am', () => {
    // 2026-01-14T21:30:00Z is 8:00am in Adelaide the next day
    const early = new Date('2026-01-14T21:30:00.000Z')
    expect(isWithinOutboundCallingWindow(early, timeZone)).toBe(false)
  })

  it('blocks a time at or after 8pm', () => {
    // 2026-01-15T09:30:00Z is 8:00pm in Adelaide the same day
    const late = new Date('2026-01-15T09:30:00.000Z')
    expect(isWithinOutboundCallingWindow(late, timeZone)).toBe(false)
  })

  it('uses the business timezone, not UTC', () => {
    // 2026-01-15T10:30:00Z is 9:00pm in Adelaide (blocked) but 10:30am in UTC (allowed)
    const instant = new Date('2026-01-15T10:30:00.000Z')
    expect(isWithinOutboundCallingWindow(instant, 'Australia/Adelaide')).toBe(false)
    expect(isWithinOutboundCallingWindow(instant, 'UTC')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/outboundWindow.test.ts`
Expected: FAIL — `./outboundWindow` module doesn't exist yet.

- [ ] **Step 3: Write `src/lib/outboundWindow.ts`**

```ts
import { hourInZone } from '@/lib/timezone'

export const OUTBOUND_WINDOW_START_HOUR = 9
export const OUTBOUND_WINDOW_END_HOUR = 20 // 8pm, exclusive

/**
 * Outbound calls are only allowed 9am-8pm in the business's own timezone —
 * a fixed, non-configurable safety backstop alongside the client's consent
 * confirmation, since AU telemarketing rules mandate calling windows.
 */
export function isWithinOutboundCallingWindow(now: Date, timeZone: string): boolean {
  const hour = hourInZone(now, timeZone)
  return hour >= OUTBOUND_WINDOW_START_HOUR && hour < OUTBOUND_WINDOW_END_HOUR
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/outboundWindow.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/outboundWindow.ts src/lib/outboundWindow.test.ts
git commit -m "$(cat <<'EOF'
Add the 9am-8pm outbound calling window guard

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Campaign server actions

**Files:**
- Create: `src/app/(dashboard)/campaigns/actions.ts`

**Interfaces:**
- Consumes: `getCurrentBusiness` (`@/lib/business`), `parseContactsCsv` (Task 3), `listPhoneNumbers`/`resolveOutboundPhoneNumberId`/`createOutboundCall` (Task 4), `isWithinOutboundCallingWindow` (Task 5)
- Produces: `createCampaignAction(formData: FormData): Promise<void>` (form action, redirects on success); `confirmConsentAction(campaignId: string): Promise<void>`; `callNextBatchAction(campaignId: string): Promise<{ placed: number; failed: number }>` — the latter two are called directly from a Client Component (Task 7), not `<form action>`.

- [ ] **Step 1: Write `src/app/(dashboard)/campaigns/actions.ts`**

```ts
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { parseContactsCsv } from '@/lib/outboundCsv'
import { listPhoneNumbers, resolveOutboundPhoneNumberId, createOutboundCall } from '@/lib/vapi'
import { isWithinOutboundCallingWindow } from '@/lib/outboundWindow'

const BATCH_SIZE = 5

export async function createCampaignAction(formData: FormData): Promise<void> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')

  const name = (formData.get('name') as string).trim()
  const file = formData.get('csv') as File
  if (!file || file.size === 0) throw new Error('Choose a CSV file to upload.')

  const csvText = await file.text()
  const { valid, skipped } = parseContactsCsv(csvText)
  if (valid.length === 0) throw new Error('No valid contacts found in that file — check it has name and phone columns.')

  const supabase = await createClient()
  const { data: campaign, error: campaignError } = await supabase
    .from('outbound_campaigns')
    .insert({ business_id: biz.id, name: name || 'Untitled campaign' })
    .select('id')
    .single()
  if (campaignError || !campaign) throw new Error(campaignError?.message ?? 'Failed to create campaign.')

  const { error: contactsError } = await supabase.from('outbound_campaign_contacts').insert(
    valid.map(c => ({ campaign_id: campaign.id, name: c.name, phone: c.phone, note: c.note })),
  )
  if (contactsError) throw new Error(contactsError.message)

  revalidatePath('/campaigns')
  redirect(`/campaigns/${campaign.id}${skipped > 0 ? `?skipped=${skipped}` : ''}`)
}

export async function confirmConsentAction(campaignId: string): Promise<void> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')

  const supabase = await createClient()
  const { error } = await supabase
    .from('outbound_campaigns')
    .update({ status: 'active', consent_confirmed_at: new Date().toISOString() })
    .eq('id', campaignId)
    .eq('business_id', biz.id)
  if (error) throw new Error(error.message)

  revalidatePath(`/campaigns/${campaignId}`)
}

export async function callNextBatchAction(campaignId: string): Promise<{ placed: number; failed: number }> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')
  if (!biz.vapi_assistant_id) throw new Error('This location has no Vapi assistant configured.')
  if (!biz.twilio_phone_number) throw new Error('This location has no phone number configured.')

  if (!isWithinOutboundCallingWindow(new Date(), biz.timezone)) {
    throw new Error('Outbound calls can only be placed between 9am and 8pm.')
  }

  const supabase = await createClient()

  const { data: campaign } = await supabase
    .from('outbound_campaigns')
    .select('id, status')
    .eq('id', campaignId)
    .eq('business_id', biz.id)
    .single()
  if (!campaign) throw new Error('Campaign not found.')
  if (campaign.status !== 'active') throw new Error('Confirm consent before placing calls.')

  const { data: pending } = await supabase
    .from('outbound_campaign_contacts')
    .select('id, name, phone, note')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (!pending || pending.length === 0) {
    revalidatePath(`/campaigns/${campaignId}`)
    return { placed: 0, failed: 0 }
  }

  const phoneNumbers = await listPhoneNumbers()
  const phoneNumberId = resolveOutboundPhoneNumberId(phoneNumbers, biz.twilio_phone_number)
  if (!phoneNumberId) {
    throw new Error(`This location's number (${biz.twilio_phone_number}) isn't imported into Vapi as an outbound-capable number.`)
  }

  let placed = 0
  let failed = 0

  for (const contact of pending) {
    try {
      const call = await createOutboundCall({
        assistantId: biz.vapi_assistant_id,
        phoneNumberId,
        customerNumber: contact.phone,
        variableValues: {
          customerName: contact.name,
          ...(contact.note ? { note: contact.note } : {}),
        },
      })
      await supabase.from('outbound_campaign_contacts')
        .update({ status: 'calling', vapi_call_id: call.id })
        .eq('id', contact.id)
      placed++
    } catch (err) {
      console.error(`Failed to place outbound call for contact ${contact.id}:`, err)
      failed++
    }
  }

  revalidatePath(`/campaigns/${campaignId}`)
  return { placed, failed }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/campaigns/actions.ts"
git commit -m "$(cat <<'EOF'
Add server actions for creating campaigns, confirming consent, and placing outbound call batches

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Campaigns pages

**Files:**
- Create: `src/app/(dashboard)/campaigns/page.tsx`
- Create: `src/app/(dashboard)/campaigns/[id]/page.tsx`
- Create: `src/app/(dashboard)/campaigns/[id]/CampaignDetailActions.tsx`

**Interfaces:**
- Consumes: `createCampaignAction`, `confirmConsentAction`, `callNextBatchAction` (Task 6); `isFeatureEnabled` (`@/lib/dashboardFeatures`, existing); `getCurrentBusiness` (existing)

- [ ] **Step 1: Write `src/app/(dashboard)/campaigns/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { isFeatureEnabled } from '@/lib/dashboardFeatures'
import { createCampaignAction } from './actions'
import { Megaphone, Plus } from 'lucide-react'

export default async function CampaignsPage() {
  const { business: biz } = await getCurrentBusiness()
  if (!isFeatureEnabled(biz, 'campaigns')) redirect('/')
  if (!biz) redirect('/')

  const supabase = await createClient()
  const { data: campaigns } = await supabase
    .from('outbound_campaigns')
    .select('id, name, status, created_at')
    .eq('business_id', biz.id)
    .order('created_at', { ascending: false })

  const counts = Object.fromEntries(
    await Promise.all((campaigns ?? []).map(async c => {
      const { count: total } = await supabase.from('outbound_campaign_contacts').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id)
      const { count: done } = await supabase.from('outbound_campaign_contacts').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('status', 'done')
      return [c.id, { total: total ?? 0, done: done ?? 0 }]
    })),
  )

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-5">
        <div className="flex items-center gap-2.5">
          <Megaphone size={20} style={{ color: 'var(--ink)' }} />
          <h1 className="font-extrabold text-xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Campaigns</h1>
        </div>

        <section className="rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
          <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
            <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>New campaign</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
              Upload a CSV with <code>name</code>, <code>phone</code>, and an optional <code>note</code> column — this is exactly who Ellie will call, so filter the list yourself before uploading.
            </p>
          </div>
          <form action={createCampaignAction} className="p-5 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Campaign name</label>
              <input type="text" name="name" required placeholder="Spring re-engagement" className="rounded-lg px-3 py-2 text-sm" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Contacts CSV</label>
              <input type="file" name="csv" accept=".csv" required className="text-sm" />
            </div>
            <button type="submit" className="w-fit rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--violet)' }}>
              <span className="flex items-center gap-1.5"><Plus size={14} /> Create campaign</span>
            </button>
          </form>
        </section>

        <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
          <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
            <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Your campaigns</h2>
          </div>
          {(campaigns ?? []).length === 0 ? (
            <p className="text-sm p-5" style={{ color: 'var(--ink-3)' }}>No campaigns yet.</p>
          ) : (
            (campaigns ?? []).map((c, i) => (
              <Link key={c.id} href={`/campaigns/${c.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-black/[0.02] transition-colors"
                style={{ borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{c.name}</p>
                  <p className="text-xs mt-0.5 capitalize" style={{ color: 'var(--ink-3)' }}>{c.status}</p>
                </div>
                <p className="text-xs font-mono" style={{ color: 'var(--ink-3)' }}>
                  {counts[c.id]?.done ?? 0}/{counts[c.id]?.total ?? 0} done
                </p>
              </Link>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `src/app/(dashboard)/campaigns/[id]/CampaignDetailActions.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { confirmConsentAction, callNextBatchAction } from '../actions'

type Props = {
  campaignId: string
  status: string
  pendingCount: number
}

export default function CampaignDetailActions({ campaignId, status, pendingCount }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [consented, setConsented] = useState(false)

  function confirmConsent() {
    setMessage('')
    startTransition(async () => {
      try {
        await confirmConsentAction(campaignId)
        router.refresh()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed to confirm.')
      }
    })
  }

  function callBatch() {
    setMessage('')
    startTransition(async () => {
      try {
        const result = await callNextBatchAction(campaignId)
        setMessage(`Placed ${result.placed} call${result.placed === 1 ? '' : 's'}${result.failed ? `, ${result.failed} failed` : ''}.`)
        router.refresh()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed to place calls.')
      }
    })
  }

  if (status === 'draft') {
    return (
      <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
        <label className="flex items-start gap-2.5 text-sm cursor-pointer" style={{ color: 'var(--ink)' }}>
          <input type="checkbox" checked={consented} onChange={e => setConsented(e.target.checked)} className="mt-0.5" />
          These are my own existing customers and I have the right to contact them.
        </label>
        <button onClick={confirmConsent} disabled={!consented || isPending}
          className="w-fit rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ background: 'var(--violet)' }}>
          {isPending ? 'Confirming…' : 'Confirm & activate'}
        </button>
        {message && <p className="text-xs" style={{ color: 'var(--coral)' }}>{message}</p>}
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
      <button onClick={callBatch} disabled={isPending || pendingCount === 0}
        className="w-fit rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
        style={{ background: 'var(--violet)' }}>
        {isPending ? 'Calling…' : pendingCount === 0 ? 'All contacts called' : `Call next batch (${Math.min(5, pendingCount)} of ${pendingCount} pending)`}
      </button>
      {message && <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{message}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Write `src/app/(dashboard)/campaigns/[id]/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { isFeatureEnabled } from '@/lib/dashboardFeatures'
import CampaignDetailActions from './CampaignDetailActions'

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ skipped?: string }>
}) {
  const { id } = await params
  const { skipped } = await searchParams
  const { business: biz } = await getCurrentBusiness()
  if (!isFeatureEnabled(biz, 'campaigns')) redirect('/')
  if (!biz) redirect('/')

  const supabase = await createClient()
  const { data: campaign } = await supabase
    .from('outbound_campaigns')
    .select('id, name, status')
    .eq('id', id)
    .eq('business_id', biz.id)
    .single()
  if (!campaign) redirect('/campaigns')

  const { data: contacts } = await supabase
    .from('outbound_campaign_contacts')
    .select('id, name, phone, note, status, outcome')
    .eq('campaign_id', id)
    .order('created_at', { ascending: true })

  const pendingCount = (contacts ?? []).filter(c => c.status === 'pending').length

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-5">
        <div>
          <h1 className="font-extrabold text-xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>{campaign.name}</h1>
          <p className="text-xs mt-1 capitalize" style={{ color: 'var(--ink-3)' }}>{campaign.status} · {(contacts ?? []).length} contacts</p>
        </div>

        {skipped && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>
            {skipped} row{skipped === '1' ? '' : 's'} skipped — missing a name/phone or an unrecognisable phone number.
          </div>
        )}

        <CampaignDetailActions campaignId={campaign.id} status={campaign.status} pendingCount={pendingCount} />

        <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
          <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
            <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Contacts</h2>
          </div>
          {(contacts ?? []).map((c, i) => (
            <div key={c.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{c.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{c.phone}{c.note ? ` · ${c.note}` : ''}</p>
              </div>
              <p className="text-xs font-semibold capitalize" style={{ color: 'var(--ink-3)' }}>
                {c.status === 'done' ? (c.outcome ?? 'done') : c.status}
              </p>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Manual check**

Run `npm run dev`, log in as a test client with the `campaigns` feature enabled (toggle it on for a test client via `/admin/clients/[id]`), navigate to `/campaigns`, create a campaign with a small test CSV, confirm consent, and click "Call next batch" (expect a Vapi API error if `VAPI_PRIVATE_KEY`/a real assistant/phone number aren't configured in this environment — that's expected without live credentials; confirm the UI surfaces that error message rather than crashing).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/campaigns/page.tsx" "src/app/(dashboard)/campaigns/[id]/page.tsx" "src/app/(dashboard)/campaigns/[id]/CampaignDetailActions.tsx"
git commit -m "$(cat <<'EOF'
Add the client-facing Campaigns list and detail pages

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Webhook hook — flip campaign contacts to done

**Files:**
- Modify: `src/app/api/vapi-webhook/route.ts`

**Interfaces:**
- No new exports — this is an internal addition to the existing `end-of-call-report` handler.

- [ ] **Step 1: Extract the `outcome` value and add the campaign-contact hook**

In the `end-of-call-report` handler, change (currently):

```ts
      const { error } = await supabase.from('calls').upsert({
        business_id:        biz.id,
        vapi_call_id:       callId,
        vapi_assistant_id:  assistantId,
        call_type:          report.call?.type ?? null,
        status:             'ended',
        caller_name:        callerName,
        caller_phone:       customer.number ?? null,
        assistant_phone:    eocAssistantPhone(report) ?? null,
        started_at:         startedAt ?? null,
        ended_at:           endedAt ?? null,
        duration_seconds:   eocDurationSeconds(report, startedAt, endedAt) ?? null,
        ended_reason:       endedReason ?? null,
        outcome:            classifyCall(endedReason, hasBooking, hasReschedule, hasBookingLink).category,
        summary:            (report.analysis?.summary ?? report.summary ?? null) as string | null,
        success_evaluation: (report.analysis?.successEvaluation ?? null) as string | null,
        transcript:         (report.artifact?.transcript ?? report.transcript ?? null) as string | null,
        recording_url:      (report.artifact?.recordingUrl ?? report.recordingUrl ?? null) as string | null,
        raw_payload:        report,
        updated_at:         new Date().toISOString(),
      }, { onConflict: 'vapi_call_id' })

      if (error) console.error('Failed to save call record:', error)
    } catch (err) {
```

to:

```ts
      const outcome = classifyCall(endedReason, hasBooking, hasReschedule, hasBookingLink).category

      const { error } = await supabase.from('calls').upsert({
        business_id:        biz.id,
        vapi_call_id:       callId,
        vapi_assistant_id:  assistantId,
        call_type:          report.call?.type ?? null,
        status:             'ended',
        caller_name:        callerName,
        caller_phone:       customer.number ?? null,
        assistant_phone:    eocAssistantPhone(report) ?? null,
        started_at:         startedAt ?? null,
        ended_at:           endedAt ?? null,
        duration_seconds:   eocDurationSeconds(report, startedAt, endedAt) ?? null,
        ended_reason:       endedReason ?? null,
        outcome,
        summary:            (report.analysis?.summary ?? report.summary ?? null) as string | null,
        success_evaluation: (report.analysis?.successEvaluation ?? null) as string | null,
        transcript:         (report.artifact?.transcript ?? report.transcript ?? null) as string | null,
        recording_url:      (report.artifact?.recordingUrl ?? report.recordingUrl ?? null) as string | null,
        raw_payload:        report,
        updated_at:         new Date().toISOString(),
      }, { onConflict: 'vapi_call_id' })

      if (error) console.error('Failed to save call record:', error)

      // This call may have been placed by an outbound campaign batch (see
      // src/app/(dashboard)/campaigns/actions.ts) — if so, flip that contact
      // to done with the same outcome, and complete the campaign once every
      // contact has one. A no-op for any ordinary inbound/webCall.
      const { data: campaignContact } = await supabase
        .from('outbound_campaign_contacts')
        .select('id, campaign_id')
        .eq('vapi_call_id', callId)
        .single()

      if (campaignContact) {
        await supabase.from('outbound_campaign_contacts')
          .update({ status: 'done', outcome })
          .eq('id', campaignContact.id)

        const { count: remaining } = await supabase
          .from('outbound_campaign_contacts')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaignContact.campaign_id)
          .neq('status', 'done')

        if (remaining === 0) {
          await supabase.from('outbound_campaigns')
            .update({ status: 'completed' })
            .eq('id', campaignContact.campaign_id)
        }
      }
    } catch (err) {
```

- [ ] **Step 2: Run the existing webhook test suite**

Run: `npx vitest run src/app/api/vapi-webhook/route.test.ts`
Expected: PASS (21 tests) — none of these tests seed `outbound_campaign_contacts`, so `campaignContact` is always falsy against the in-memory fake and this new block is a no-op for every existing test, exercising nothing but the "not a campaign call" path.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/vapi-webhook/route.ts
git commit -m "$(cat <<'EOF'
Flip outbound campaign contacts to done when their call's report lands

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — every prior test plus the new ones from Tasks 2, 3, 4, 5 (dashboardFeatures 7, outboundCsv 5, vapi 3, outboundWindow 4 — 19 new assertions across those files).

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS, no errors in any file this plan touched (this repo's full `npm run lint` run may show pre-existing, unrelated errors from stray build artifacts under `.claude/worktrees/` — not in scope, ignore those).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds successfully, including the two new `/campaigns` routes.

- [ ] **Step 4: End-to-end manual walkthrough**

With `npm run dev` running against a local Supabase instance (never the real hosted project — this involves creating test data and, if real Vapi/Twilio credentials are configured, placing real phone calls):

1. As admin, enable the `campaigns` feature for a test client (`/admin/clients/[id]` → Dashboard Features).
2. Log in as that client, confirm "Campaigns" appears in the sidebar (and is absent for a client without the feature enabled).
3. Create a campaign with a small CSV (2-3 rows, at least one with a deliberately bad phone number to confirm the skipped-row banner appears).
4. Confirm the consent checkbox gates the "Confirm & activate" button, and that "Call next batch" isn't available until consent is confirmed.
5. If real Vapi/Twilio credentials and an imported outbound-capable number are available for this test client: click "Call next batch", confirm calls place and contacts move to "calling", then confirm an end-of-call-report flips a contact to "done" with the right outcome and the campaign completes once every contact is done. If real credentials aren't available in this environment, confirm instead that a clear, non-crashing error message is shown (e.g. "isn't imported into Vapi as an outbound-capable number" or a Vapi API error) — note explicitly which of the two was observed.
6. Confirm a second location (if the test client has one from the multi-location work) has its own, fully independent set of campaigns.

- [ ] **Step 5: Report results**

Summarize pass/fail for each of steps 1-4 before considering this plan complete. Any failure found here should be fixed with a follow-up commit before moving on to sub-project 4 (ERP integration).
